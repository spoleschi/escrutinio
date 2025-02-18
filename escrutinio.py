# escrutinio.py
from flask import Flask, render_template, jsonify, request, session
import pyodbc
import pandas as pd
from datetime import datetime
import logging
from io import BytesIO
from flask import Flask, render_template, jsonify, send_file
import json
import hashlib

# escrutinio = Flask(__name__)
escrutinio = Flask(__name__, static_url_path='/static')

# Configurar una clave secreta para las sesiones
escrutinio.secret_key = 'admin2020'  # Debería ir en variable de entorno

# Configurar logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)


# Cargar configuración desde archivo JSON
with open('config.json', 'r') as config_file:
    config = json.load(config_file)

# Configuración de la base de datos
DB_CONFIG = {
    'DRIVER': '{ODBC Driver 17 for SQL Server}',
    'SERVER': config["DB_SERVER"],
    'DATABASE': config["DB_NAME"],
    'UID': config["DB_USER"],
    'PWD': config["DB_PASSWORD"]
}

def get_db_connection():
    try:
        conn_str = 'DRIVER={};SERVER={};DATABASE={};UID={};PWD={}'.format(
            DB_CONFIG['DRIVER'],
            DB_CONFIG['SERVER'],
            DB_CONFIG['DATABASE'],
            DB_CONFIG['UID'],
            DB_CONFIG['PWD']
        )
        logger.debug(f"Intentando conectar a la base de datos: {DB_CONFIG['SERVER']}/{DB_CONFIG['DATABASE']}")
        return pyodbc.connect(conn_str)
    except Exception as e:
        logger.error(f"Error conectando a la base de datos: {str(e)}")
        raise

@escrutinio.route('/')
def index():
    return render_template('index.html')

@escrutinio.route('/api/datos')
def get_datos():
    try:
        logger.debug("Iniciando solicitud /api/datos")
        conn = get_db_connection()
        logger.info("Conexión a base de datos establecida")
        
        # Consulta para obtener datos combinados
        query = """
        SELECT 
            s.Sucursal,
            s.Cantidad as CantidadVotantes,
            CASE 
                WHEN e.Sucursal IS NOT NULL THEN 1 
                ELSE 0 
            END as Procesado,
            COALESCE(e.Lista1, 0) as Lista1,
            COALESCE(e.Lista2, 0) as Lista2,
            COALESCE(e.Lista3, 0) as Lista3,
            COALESCE(e.Blanco, 0) as Blanco,
            COALESCE(e.Anulado, 0) as Anulado,
            COALESCE(e.Recurrido, 0) as Recurrido,
            COALESCE(e.Lista1, 0) + COALESCE(e.Lista2, 0) + 
            COALESCE(e.Lista3, 0) + COALESCE(e.Blanco, 0) + 
            COALESCE(e.Anulado, 0) + COALESCE(e.Recurrido, 0) as TotalVotos
        FROM 
            Sucursales s
            LEFT JOIN Elecciones2025 e ON s.Sucursal = e.Sucursal
        ORDER BY 
            s.Sucursal
        """
        
        logger.debug(f"Ejecutando query: {query}")
        df = pd.read_sql(query, conn)
        logger.info(f"Query ejecutada. Registros obtenidos: {len(df)}")
        
        # Calcular estadísticas generales
        total_sucursales = len(df)
        procesadas = df['Procesado'].sum()
        pendientes = total_sucursales - procesadas
        
        # Calcular totales de votos por lista
        totales = {
            'Lista1': int(df['Lista1'].sum()),
            'Lista2': int(df['Lista2'].sum()),
            'Lista3': int(df['Lista3'].sum()),
            'Blanco': int(df['Blanco'].sum()),
            'Anulado': int(df['Anulado'].sum()),
            'Recurrido': int(df['Recurrido'].sum()),
            'TotalVotos': int(df['TotalVotos'].sum()),
            'TotalVotantes': int(df['CantidadVotantes'].sum())
        }
        
        logger.debug(f"Estadísticas calculadas: {totales}")
        
        # Convertir DataFrame a diccionario para JSON
        datos = df.to_dict('records')
        
        response_data = {
            'datos': datos,
            'estadisticas': {
                'total_sucursales': total_sucursales,
                'procesadas': int(procesadas),
                'pendientes': int(pendientes),
                'totales': totales,
                'ultima_actualizacion': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }
        }
        
        logger.info("Respuesta JSON preparada exitosamente")
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"Error en get_datos: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()
            logger.debug("Conexión a base de datos cerrada")
            
@escrutinio.route('/api/exportar-excel')
def exportar_excel():
    try:
        logger.debug("Iniciando exportación a Excel")
        conn = get_db_connection()
        
        # Usar la misma consulta que ya tengo
        query = """
        SELECT 
            s.Sucursal,
            s.Cantidad as CantidadVotantes,
            COALESCE(e.Lista1, 0) as Lista1,
            COALESCE(e.Lista2, 0) as Lista2,
            COALESCE(e.Lista3, 0) as Lista3,
            COALESCE(e.Blanco, 0) as Blanco,
            COALESCE(e.Anulado, 0) as Anulado,
            COALESCE(e.Recurrido, 0) as Recurrido,
            COALESCE(e.Lista1, 0) + COALESCE(e.Lista2, 0) + 
            COALESCE(e.Lista3, 0) + COALESCE(e.Blanco, 0) + 
            COALESCE(e.Anulado, 0) + COALESCE(e.Recurrido, 0) as TotalVotos
        FROM 
            Sucursales s
            INNER JOIN Elecciones2025 e ON s.Sucursal = e.Sucursal
        ORDER BY 
            s.Sucursal
        """
        
        df = pd.read_sql(query, conn)
        
        # Calcular porcentaje de participación
        df['Participación'] = (df['TotalVotos'] / df['CantidadVotantes'] * 100).round(2).astype(str) + '%'
        
        # Crear el Excel en memoria
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='Resultados', index=False)
            
            # Obtener la hoja de trabajo para ajustar el ancho de las columnas
            worksheet = writer.sheets['Resultados']
            for idx, col in enumerate(df.columns):
                max_length = max(df[col].astype(str).apply(len).max(), len(col)) + 2
                worksheet.column_dimensions[chr(65 + idx)].width = max_length
        
        output.seek(0)
        
        # Generar nombre del archivo con timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'resultados_elecciones_{timestamp}.xlsx'
        
        logger.info(f"Excel generado exitosamente: {filename}")
        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=filename
        )
        
    except Exception as e:
        logger.error(f"Error en exportar_excel: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()
            logger.debug("Conexión a base de datos cerrada")
            
@escrutinio.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')
        
        # Hash de la contraseña (asumiendo que en la BD están hasheadas)
        # hashed_password = hashlib.md5(password.encode()).hexdigest()
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Consulta a la tabla de usuarios
        query = """
        SELECT Usuario, Nombre
        FROM UsuariosElec 
        WHERE Usuario = ? AND Password = ?
        """
        
        # cursor.execute(query, (username, hashed_password))
        cursor.execute(query, (username, password))
        user = cursor.fetchone()
        
        if user:
            # Guardar información del usuario en la sesión
            session['user'] = {
                'username': user[0],
                'nombre': user[1]
            }
            return jsonify({
                'success': True,
                'user': {
                    'username': user[0],
                    'nombre': user[1]
                }
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Usuario o contraseña incorrectos'
            }), 401
            
    except Exception as e:
        logger.error(f"Error en login: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()

@escrutinio.route('/api/logout')
def logout():
    session.pop('user', None)
    return jsonify({'success': True})

@escrutinio.route('/api/check-session')
def check_session():
    if 'user' in session:
        return jsonify({
            'logged_in': True,
            'user': session['user']
        })
    return jsonify({'logged_in': False})

@escrutinio.route('/api/borrar-sucursal/<sucursal>', methods=['DELETE'])
def borrar_sucursal(sucursal):
    if 'user' not in session:
        return jsonify({'error': 'No autorizado'}), 401
        
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Borrar el registro
        query = "DELETE FROM Elecciones2025 WHERE Sucursal = ?"
        cursor.execute(query, (sucursal,))
        conn.commit()
        
        return jsonify({
            'success': True,
            'message': f'Sucursal {sucursal} eliminada correctamente'
        })
        
    except Exception as e:
        logger.error(f"Error al borrar sucursal: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()            
            
if __name__ == '__main__':
    # escrutinio.run(debug=True)
    escrutinio.run(host='0.0.0.0', port=5000, debug=True)