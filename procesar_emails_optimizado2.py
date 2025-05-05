import imaplib
import email
from email.header import decode_header
from email.message import Message  
import os
import pandas as pd
import pyodbc
import logging
from datetime import datetime
import yaml
from typing import Optional, List, Dict, Set
import shutil

class Config:
    def __init__(self, config_file: str = 'P:/Sistemas/elecciones2025/Procesa_mails/config.yaml'):
        with open(config_file, 'r') as f:
            config = yaml.safe_load(f)
        
        # Email settings
        self.IMAP_SERVER = config['email']['server']
        self.EMAIL_ACCOUNT = config['email']['username']
        self.EMAIL_PASSWORD = config['email']['password']
        
        # Database settings
        self.DB_SERVER = config['database']['server']
        self.DB_NAME = config['database']['name']
        self.DB_USER = config['database']['username']
        self.DB_PASSWORD = config['database']['password']
        self.TABLE_NAME = config['database']['table']
        
        # File paths
        base_path = config['paths']['base_dir']
        self.PATHS = {
            'processed': os.path.join(base_path, 'mails_procesados'),
            'error': os.path.join(base_path, 'mails_error'),
            'duplicate': os.path.join(base_path, 'mails_duplicados'),
            'temp': os.path.join(base_path, 'temp'),
            'logs': os.path.join(base_path, 'logs')
        }
        
        self.PROCESSED_IDS_FILE = os.path.join(base_path, 'processed_ids.txt')
        
        # Create necessary directories
        for path in self.PATHS.values():
            os.makedirs(path, exist_ok=True)

class DatabaseManager:
    def __init__(self, config: Config):
        self.config = config
        self.conn_str = (
            f'DRIVER={{ODBC Driver 17 for SQL Server}};'
            f'SERVER={config.DB_SERVER};'
            f'DATABASE={config.DB_NAME};'
            f'UID={config.DB_USER};'
            f'PWD={config.DB_PASSWORD}'
        )

    def connect(self) -> pyodbc.Connection:
        return pyodbc.connect(self.conn_str)

    def check_duplicate(self, conn: pyodbc.Connection, cod_ubic: str) -> bool:
        cursor = conn.cursor()
        cursor.execute(
            f"SELECT COUNT(*) FROM {self.config.TABLE_NAME} WHERE Cod_Ubic = ?", 
            cod_ubic
        )
        return cursor.fetchone()[0] > 0

    def insert_data(self, conn: pyodbc.Connection, data: List) -> None:
        cursor = conn.cursor()
        cursor.execute(
            f"""INSERT INTO {self.config.TABLE_NAME} 
            (Cod_Ubic, Total, Lista_Blanca, Lista_Celeste, En_Blanco, Anulados, Recurridos, Observados) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""", 
            data
        )
        conn.commit()

class EmailProcessor:
    def __init__(self, config: Config):
        self.config = config
        self.db_manager = DatabaseManager(config)
        self.setup_logging()
        self.processed_ids = self.load_processed_ids()

    def setup_logging(self) -> None:
        log_file = os.path.join(
            self.config.PATHS['logs'], 
            f'process_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log'
        )
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(log_file),
                logging.StreamHandler()
            ]
        )

    def load_processed_ids(self) -> Set[str]:
        if os.path.exists(self.config.PROCESSED_IDS_FILE):
            with open(self.config.PROCESSED_IDS_FILE, 'r') as f:
                return set(line.strip() for line in f)
        return set()

    def save_processed_id(self, mail_id: str) -> None:
        with open(self.config.PROCESSED_IDS_FILE, 'a') as f:
            f.write(f"{mail_id}\n")
        # Actualizar también el conjunto en memoria
        self.processed_ids.add(mail_id)

    def decode_filename(self, encoded_filename: str) -> str:
        decoded_parts = decode_header(encoded_filename)
        filename_parts = []
        for part, encoding in decoded_parts:
            if isinstance(part, bytes):
                filename_parts.append(part.decode(encoding or 'utf-8'))
            else:
                filename_parts.append(part)
        filename = ''.join(filename_parts)
        return filename.replace('/', '_').replace('\\', '_')

    def get_unique_filepath(self, base_path: str, filename: str) -> str:
        filepath = os.path.join(base_path, filename)
        if not os.path.exists(filepath):
            return filepath
        
        base, ext = os.path.splitext(filename)
        counter = 1
        while os.path.exists(filepath):
            filepath = os.path.join(base_path, f"{base}_{counter}{ext}")
            counter += 1
        return filepath

    def process_excel(self, filepath: str) -> Optional[List]:
        try:
            df = pd.read_excel(filepath, header=None)
            if df.shape[0] < 2:
                raise ValueError("El archivo no tiene suficientes filas")

            row = df.iloc[1]  # Primera fila de datos (índice 1)
            cod_ubic = str(row[0])
            
            # Convertir valores numéricos y manejar nulos
            valores = [cod_ubic] + [
                int(x) if pd.notna(x) and str(x).strip().isdigit() 
                else 0 for x in row[1:8]
            ]
            
            return valores
        except Exception as e:
            logging.error(f"Error procesando excel {filepath}: {str(e)}")
            return None

    def process_attachment(self, part: Message, mail_id: str) -> bool:
        try:
            if not part.get_filename():
                return False

            filename = self.decode_filename(part.get_filename())
            if not filename.lower().endswith(('.xls', '.xlsx')):
                return False

            # Guardar temporalmente el archivo
            temp_path = self.get_unique_filepath(self.config.PATHS['temp'], filename)
            with open(temp_path, 'wb') as f:
                f.write(part.get_payload(decode=True))

            # Procesar el archivo
            data = self.process_excel(temp_path)
            if not data:
                dest_path = self.get_unique_filepath(self.config.PATHS['error'], filename)
                shutil.move(temp_path, dest_path)
                return False

            # Verificar duplicados y guardar en base de datos
            with self.db_manager.connect() as conn:
                if self.db_manager.check_duplicate(conn, data[0]):
                    dest_path = self.get_unique_filepath(
                        self.config.PATHS['duplicate'], 
                        filename
                    )
                    logging.info(f"Sucursal duplicada: {data[0]}")
                else:
                    self.db_manager.insert_data(conn, data)
                    dest_path = self.get_unique_filepath(
                        self.config.PATHS['processed'], 
                        filename
                    )
                    logging.info(f"Datos insertados para sucursal: {data[0]}")

            shutil.move(temp_path, dest_path)
            return True

        except Exception as e:
            logging.error(f"Error procesando adjunto: {str(e)}")
            if 'temp_path' in locals() and os.path.exists(temp_path):
                error_path = self.get_unique_filepath(
                    self.config.PATHS['error'], 
                    filename
                )
                shutil.move(temp_path, error_path)
            return False

    def process_emails(self) -> None:
        try:
            # Conectar al servidor de correo
            mail = imaplib.IMAP4_SSL(self.config.IMAP_SERVER)
            mail.login(self.config.EMAIL_ACCOUNT, self.config.EMAIL_PASSWORD)
            mail.select('inbox')

            # Buscar todos los correos
            _, messages = mail.uid('search', None, 'ALL')
            
            for message in messages[0].split():
                mail_id = message.decode('utf-8')
                
                if mail_id in self.processed_ids:
                    logging.info(f"Correo {mail_id} ya procesado")
                    continue

                try:
                    _, msg_data = mail.uid('fetch', message, '(RFC822)')
                    email_body = msg_data[0][1]
                    email_message = email.message_from_bytes(email_body)

                    processed_any = False
                    for part in email_message.walk():
                        if part.get_content_maintype() == 'multipart':
                            continue
                        if part.get('Content-Disposition') is None:
                            continue
                        
                        if self.process_attachment(part, mail_id):
                            processed_any = True
                    
                    # Marcar el correo como procesado independientemente de si tenía adjuntos válidos
                    self.save_processed_id(mail_id)
                    logging.info(f"Correo {mail_id} marcado como procesado")

                except Exception as e:
                    logging.error(f"Error procesando correo {mail_id}: {str(e)}")

        except Exception as e:
            logging.error(f"Error en la conexión de correo: {str(e)}")
        finally:
            try:
                mail.logout()
            except:
                pass  # En caso de que la conexión ya esté cerrada

def main():
    try:
        config = Config()
        processor = EmailProcessor(config)
        processor.process_emails()
    except Exception as e:
        logging.error(f"Error en la ejecución principal: {str(e)}")

if __name__ == "__main__":
    main()
    