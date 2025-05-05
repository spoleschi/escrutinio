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
from typing import Optional, List, Dict, Set, Tuple
import shutil
import time

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
            'logs': os.path.join(base_path, 'logs'),
            'pdfs_processed': os.path.join(base_path, 'PDFs_procesados'),
            'pdfs_not_processed': os.path.join(base_path, 'PDFs_no_procesados')
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

    def save_attachment(self, part: Message, save_path: str) -> str:
        """Guarda un adjunto en la ruta especificada y devuelve la ruta donde se guardó"""
        if not part.get_filename():
            return None

        filename = self.decode_filename(part.get_filename())
        filepath = self.get_unique_filepath(save_path, filename)
        
        with open(filepath, 'wb') as f:
            f.write(part.get_payload(decode=True))
        
        return filepath

    def process_attachment(self, part: Message, mail_id: str) -> Tuple[bool, Optional[str]]:
        """Procesa un adjunto Excel y devuelve (éxito, cod_ubic si tuvo éxito)"""
        try:
            if not part.get_filename():
                return False, None

            filename = self.decode_filename(part.get_filename())
            if not filename.lower().endswith(('.xls', '.xlsx')):
                return False, None

            # Guardar temporalmente el archivo
            temp_path = self.get_unique_filepath(self.config.PATHS['temp'], filename)
            with open(temp_path, 'wb') as f:
                f.write(part.get_payload(decode=True))

            # Procesar el archivo
            data = self.process_excel(temp_path)
            if not data:
                dest_path = self.get_unique_filepath(self.config.PATHS['error'], filename)
                shutil.move(temp_path, dest_path)
                return False, None

            cod_ubic = data[0]  # Guardar el cod_ubic para retornarlo

            # Verificar duplicados y guardar en base de datos
            with self.db_manager.connect() as conn:
                if self.db_manager.check_duplicate(conn, data[0]):
                    dest_path = self.get_unique_filepath(
                        self.config.PATHS['duplicate'], 
                        filename
                    )
                    logging.info(f"Sucursal duplicada: {data[0]}")
                    success = False
                else:
                    self.db_manager.insert_data(conn, data)
                    dest_path = self.get_unique_filepath(
                        self.config.PATHS['processed'], 
                        filename
                    )
                    logging.info(f"Datos insertados para sucursal: {data[0]}")
                    success = True

            shutil.move(temp_path, dest_path)
            return success, cod_ubic

        except Exception as e:
            logging.error(f"Error procesando adjunto: {str(e)}")
            if 'temp_path' in locals() and os.path.exists(temp_path):
                error_path = self.get_unique_filepath(
                    self.config.PATHS['error'], 
                    filename
                )
                shutil.move(temp_path, error_path)
            return False, None

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

                    # Primero identificar todos los adjuntos del email
                    excel_parts = []
                    pdf_parts = []
                    
                    for part in email_message.walk():
                        if part.get_content_maintype() == 'multipart':
                            continue
                        if part.get('Content-Disposition') is None:
                            continue
                        
                        filename = part.get_filename()
                        if not filename:
                            continue
                            
                        filename = self.decode_filename(filename)
                        
                        if filename.lower().endswith(('.xls', '.xlsx')):
                            excel_parts.append(part)
                        elif filename.lower().endswith('.pdf'):
                            pdf_parts.append(part)
                    
                    # Procesar los Excel primero
                    successful_excel = False
                    cod_ubic = None
                    
                    for part in excel_parts:
                        success, part_cod_ubic = self.process_attachment(part, mail_id)
                        if success:
                            successful_excel = True
                            cod_ubic = part_cod_ubic
                            break  # Solo necesitamos un Excel exitoso
                    
                    # Ahora procesar los PDFs según el resultado del Excel
                    for part in pdf_parts:
                        filename = self.decode_filename(part.get_filename())
                        
                        if successful_excel:
                            # Si el Excel se procesó correctamente, guardar PDFs en carpeta procesados
                            # con el código de sucursal como prefijo
                            new_filename = f"{cod_ubic}_{filename}"
                            save_path = self.config.PATHS['pdfs_processed']
                        else:
                            # Si no hubo Excel exitoso, guardar PDFs en carpeta no procesados
                            new_filename = filename
                            save_path = self.config.PATHS['pdfs_not_processed']
                        
                        pdf_path = self.get_unique_filepath(save_path, new_filename)
                        with open(pdf_path, 'wb') as f:
                            f.write(part.get_payload(decode=True))
                        
                        logging.info(f"PDF guardado: {pdf_path}")
                    
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
        
        while True:  # Bucle infinito
            try:
                logging.info("Iniciando procesamiento de correos...")
                processor.process_emails()
                logging.info("Procesamiento completado. Esperando 5 minutos para la próxima ejecución...")
            except Exception as e:
                logging.error(f"Error durante el procesamiento: {str(e)}")
            
            time.sleep(300)  # Pausar 5 minutos (300 segundos)
    except Exception as e:
        logging.error(f"Error en la ejecución principal: {str(e)}")

if __name__ == "__main__":
    main()