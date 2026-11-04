from flask import Flask, render_template, request, jsonify, send_from_directory, abort, session, redirect, url_for
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from functools import wraps
from dotenv import load_dotenv
import hmac
import yaml
import os
import json
import base64
from pathlib import Path
from datetime import datetime
import logging
from werkzeug.exceptions import HTTPException
from utils.flow_validator import FlowValidator

# Carica le variabili d'ambiente dal file .env
load_dotenv()

# Configurazione logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config.from_object('config.Config')

# Aggiungi il filtro base64 a Jinja2
def b64encode(s):
    if isinstance(s, str):
        s = s.encode('utf-8')
    return base64.b64encode(s).decode('utf-8')

app.jinja_env.filters['b64encode'] = b64encode

# Rende is_admin e admin_mode disponibili in tutti i template
@app.context_processor
def inject_auth():
    is_admin = session.get('is_admin', False) if app.config['ADMIN_MODE'] else True
    return dict(is_admin=is_admin, admin_mode=app.config['ADMIN_MODE'],
                app_version=app.config['APP_VERSION'],
                site_title=app.config['SITE_TITLE'],
                site_subtitle=app.config['SITE_SUBTITLE'],
                site_tagline=app.config['SITE_TAGLINE'],
                org_name=app.config['ORG_NAME'], org_url=app.config['ORG_URL'],
                current_year=datetime.now().year,
                static_export=app.config.get('STATIC_EXPORT', False))

# CORS per API
CORS(app, resources={r"/api/*": {"origins": app.config['ALLOWED_ORIGINS']}})

# Rate limiting
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["5000 per day", "600 per hour"]
)

# Directory dei flows
FLOWS_DIR = Path(app.config['FLOWS_DIRECTORY'])
FLOWS_DIR.mkdir(exist_ok=True)

# Decorator per proteggere le route admin
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not app.config['ADMIN_MODE']:
            return f(*args, **kwargs)  # Se ADMIN_MODE è False, accesso libero
        
        if not session.get('is_admin'):
            if request.path.startswith('/api/'):
                return jsonify({'success': False, 'error': 'Unauthorized'}), 401
            return redirect(url_for('admin_login'))
        return f(*args, **kwargs)
    return decorated_function

class FlowManager:
    """Gestione centralizzata dei flussi"""
    
    @staticmethod
    def get_all_flows():
        """Ottiene tutti i flussi disponibili"""
        flows = []
        for yaml_file in FLOWS_DIR.glob('*.yaml'):
            try:
                with open(yaml_file, 'r', encoding='utf-8') as f:
                    flow_data = yaml.safe_load(f)
                    flows.append({
                        'id': yaml_file.stem,
                        'name': flow_data.get('metadata', {}).get('name', yaml_file.stem.title()),
                        'description': flow_data.get('metadata', {}).get('description', 'No description'),
                        'category': flow_data.get('metadata', {}).get('category', 'General'),
                        'version': flow_data.get('metadata', {}).get('version', '1.0.0'),
                        'author': flow_data.get('metadata', {}).get('author', 'Unknown'),
                        'created_at': flow_data.get('metadata', {}).get('created_at', str(datetime.now())),
                        'order': flow_data.get('metadata', {}).get('order', None),
                        'nodes_count': len(flow_data.get('nodes', {}))
                    })
            except Exception as e:
                logger.error(f"Error loading flow {yaml_file}: {e}")

        # Ordina per 'order' crescente (i flow senza 'order' vanno in fondo),
        # poi alfabeticamente per nome a parità di order.
        def sort_key(flow):
            order = flow.get('order')
            return (order is None, order if order is not None else 0, flow['name'].lower())

        return sorted(flows, key=sort_key)
    
    @staticmethod
    def load_flow(flow_id):
        """Carica un flusso specifico"""
        flow_path = FLOWS_DIR / f"{flow_id}.yaml"
        if not flow_path.exists():
            return None
        
        try:
            with open(flow_path, 'r', encoding='utf-8') as f:
                return yaml.safe_load(f)
        except Exception as e:
            logger.error(f"Error loading flow {flow_id}: {e}")
            return None
    
    @staticmethod
    def save_flow(flow_id, flow_data):
        """Salva un flusso"""
        try:
            # Validazione
            validator = FlowValidator()
            is_valid, errors = validator.validate(flow_data)
            
            if not is_valid:
                return False, errors
            
            # Aggiungi metadata
            if 'metadata' not in flow_data:
                flow_data['metadata'] = {}
            
            flow_data['metadata']['updated_at'] = str(datetime.now())
            
            flow_path = FLOWS_DIR / f"{flow_id}.yaml"
            with open(flow_path, 'w', encoding='utf-8') as f:
                yaml.dump(flow_data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
            
            return True, "Flow saved successfully"
        except Exception as e:
            logger.error(f"Error saving flow {flow_id}: {e}")
            return False, str(e)
    
    @staticmethod
    def delete_flow(flow_id):
        """Elimina un flusso"""
        flow_path = FLOWS_DIR / f"{flow_id}.yaml"
        if flow_path.exists():
            try:
                flow_path.unlink()
                return True
            except Exception as e:
                logger.error(f"Error deleting flow {flow_id}: {e}")
                return False
        return False

# Error handlers
@app.errorhandler(HTTPException)
def handle_exception(e):
    """Gestione errori HTTP"""
    logger.error(f"HTTP Error: {e}")
    if request.path.startswith('/api/'):
        return jsonify({'error': e.description}), e.code
    return render_template('error.html', error=e), e.code

@app.errorhandler(500)
def internal_error(error):
    """Gestione errori interni"""
    logger.error(f"Internal Error: {error}")
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Internal server error'}), 500
    return render_template('error.html', error="Internal server error"), 500

# Valori d'esempio che non devono mai valere come password vera
_PLACEHOLDER_PASSWORDS = {'', 'password', 'admin', 'admin123', 'changeme', 'cambiami'}

def _admin_password_usable(pw):
    return pw.strip().lower() not in _PLACEHOLDER_PASSWORDS and len(pw) >= 8

# Routes di autenticazione
@app.route('/admin/login', methods=['GET', 'POST'])
@limiter.limit("10 per minute", methods=['POST'])
def admin_login():
    """Login amministratore"""
    if request.method == 'POST':
        password = (request.get_json(silent=True) or {}).get('password') or ''
        expected = app.config['ADMIN_PASSWORD']
        if not _admin_password_usable(expected):
            logger.error("Login admin rifiutato: ADMIN_PASSWORD non impostata o ancora quella d'esempio")
            return jsonify({'success': False,
                            'error': "Login disabilitato: imposta ADMIN_PASSWORD nel file .env"}), 503
        if hmac.compare_digest(password.encode('utf-8'), expected.encode('utf-8')):
            session['is_admin'] = True
            session.permanent = True
            logger.info(f"Admin login successful from {request.remote_addr}")
            return jsonify({'success': True})
        logger.warning(f"Failed admin login attempt from {request.remote_addr}")
        return jsonify({'success': False, 'error': 'Password errata'}), 401
    
    return render_template('admin_login.html')

@app.route('/admin/logout')
def admin_logout():
    """Logout amministratore"""
    session.pop('is_admin', None)
    logger.info(f"Admin logout from {request.remote_addr}")
    return redirect(url_for('index'))

# Routes principali
@app.route('/')
def index():
    """Homepage con lista dei flussi"""
    flows = FlowManager.get_all_flows()
    
    # Raggruppa per categoria
    flows_by_category = {}
    for flow in flows:
        category = flow['category']
        if category not in flows_by_category:
            flows_by_category[category] = []
        flows_by_category[category].append(flow)
    
    # Calcola nodi totali
    total_nodes = sum(flow['nodes_count'] for flow in flows)
    
    # Determina se l'utente è admin
    is_admin = session.get('is_admin', False) if app.config['ADMIN_MODE'] else True
    
    return render_template('index.html', 
                         flows=flows, 
                         flows_by_category=flows_by_category,
                         total_flows=len(flows),
                         total_nodes=total_nodes,
                         is_admin=is_admin,
                         admin_mode=app.config['ADMIN_MODE'])

@app.route('/flow/<flow_id>')
def flow_viewer(flow_id):
    """Visualizza un flusso specifico"""
    flow_data = FlowManager.load_flow(flow_id)
    if not flow_data:
        abort(404, description=f"Flow '{flow_id}' not found")
    
    # Validate JSON serialization
    try:
        json.dumps(flow_data.get('nodes', {}), ensure_ascii=False)
    except Exception as e:
        logger.error(f"Invalid JSON in flow {flow_id}: {e}")
        abort(500, description="Invalid flow data format")
    
    # Determina se l'utente è admin
    is_admin = session.get('is_admin', False) if app.config['ADMIN_MODE'] else True
    
    return render_template('flow.html', 
                         flow_id=flow_id, 
                         flow=flow_data,
                         metadata=flow_data.get('metadata', {}),
                         is_admin=is_admin)

@app.route('/output/<flow_id>/<node_id>')
def output_viewer(flow_id, node_id):
    """Visualizza l'output finale in una template dedicata"""
    flow_data = FlowManager.load_flow(flow_id)
    if not flow_data:
        abort(404, description=f"Flow '{flow_id}' not found")
    
    nodes = flow_data.get('nodes', {})
    if node_id not in nodes or nodes[node_id]['type'] != 'output':
        abort(404, description="Output node not found or invalid")
    
    node = nodes[node_id]
    return render_template('output.html', 
                         flow_id=flow_id,
                         node_id=node_id,
                         title=node.get('title', 'Result'),
                         content=node.get('content', ''))

@app.route('/builder')
@app.route('/builder/<flow_id>')
@admin_required
def flow_builder(flow_id=None):
    """Editor visuale dei flussi (solo admin)"""
    flow_data = None
    if flow_id:
        flow_data = FlowManager.load_flow(flow_id)
        if not flow_data:
            abort(404, description=f"Flow '{flow_id}' not found")
    
    return render_template('builder.html', 
                         flow_id=flow_id, 
                         flow_data=flow_data)

# API Routes
@app.route('/api/flows', methods=['GET'])
@limiter.limit("100 per minute")
def api_get_flows():
    """API: Lista tutti i flussi"""
    flows = FlowManager.get_all_flows()
    return jsonify({'success': True, 'flows': flows})

@app.route('/api/flows/<flow_id>', methods=['GET'])
@limiter.limit("100 per minute")
def api_get_flow(flow_id):
    """API: Ottieni un flusso specifico"""
    flow_data = FlowManager.load_flow(flow_id)
    if not flow_data:
        return jsonify({'success': False, 'error': 'Flow not found'}), 404
    
    return jsonify({'success': True, 'flow': flow_data})

@app.route('/api/flows/<flow_id>/node/<node_id>', methods=['GET'])
@limiter.limit("100 per minute")
def api_get_node(flow_id, node_id):
    """API: Ottieni un nodo specifico"""
    flow_data = FlowManager.load_flow(flow_id)
    if not flow_data:
        return jsonify({'success': False, 'error': 'Flow not found'}), 404
    
    nodes = flow_data.get('nodes', {})
    if node_id not in nodes:
        return jsonify({'success': False, 'error': 'Node not found'}), 404
    
    node_data = nodes[node_id]
    node_data['id'] = node_id
    
    # Aggiungi informazioni sui nodi collegati
    if node_data.get('type') == 'question' and 'answers' in node_data:
        for answer in node_data['answers']:
            next_node = answer.get('next')
            if next_node and next_node in nodes:
                answer['next_type'] = nodes[next_node].get('type')
                answer['next_title'] = nodes[next_node].get('title', nodes[next_node].get('text', ''))
    
    return jsonify({'success': True, 'node': node_data})

@app.route('/api/flows', methods=['POST'])
@limiter.limit("10 per minute")
@admin_required
def api_create_flow():
    """API: Crea un nuovo flusso (solo admin)"""
    try:
        data = request.json
        flow_id = data.get('id')
        flow_data = data.get('flow')
        
        if not flow_id or not flow_data:
            return jsonify({'success': False, 'error': 'Missing id or flow data'}), 400
        
        # Sanitizza l'ID
        flow_id = "".join(c for c in flow_id if c.isalnum() or c in ('-', '_')).lower()
        
        success, message = FlowManager.save_flow(flow_id, flow_data)
        
        if success:
            logger.info(f"Flow '{flow_id}' created by admin from {request.remote_addr}")
            return jsonify({'success': True, 'message': message, 'flow_id': flow_id})
        else:
            return jsonify({'success': False, 'errors': message}), 400
    
    except Exception as e:
        logger.error(f"Error creating flow: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/flows/<flow_id>', methods=['PUT'])
@limiter.limit("10 per minute")
@admin_required
def api_update_flow(flow_id):
    """API: Aggiorna un flusso esistente (solo admin)"""
    try:
        flow_data = request.json
        
        if not flow_data:
            return jsonify({'success': False, 'error': 'Missing flow data'}), 400
        
        success, message = FlowManager.save_flow(flow_id, flow_data)
        
        if success:
            logger.info(f"Flow '{flow_id}' updated by admin from {request.remote_addr}")
            return jsonify({'success': True, 'message': message})
        else:
            return jsonify({'success': False, 'errors': message}), 400
    
    except Exception as e:
        logger.error(f"Error updating flow {flow_id}: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/flows/<flow_id>', methods=['DELETE'])
@limiter.limit("5 per minute")
@admin_required
def api_delete_flow(flow_id):
    """API: Elimina un flusso (solo admin)"""
    if FlowManager.delete_flow(flow_id):
        logger.info(f"Flow '{flow_id}' deleted by admin from {request.remote_addr}")
        return jsonify({'success': True, 'message': 'Flow deleted successfully'})
    else:
        return jsonify({'success': False, 'error': 'Could not delete flow'}), 400

@app.route('/api/flows/validate', methods=['POST'])
@limiter.limit("20 per minute")
def api_validate_flow():
    """API: Valida un flusso"""
    try:
        flow_data = request.json
        validator = FlowValidator()
        is_valid, errors = validator.validate(flow_data)
        
        return jsonify({
            'success': True,
            'valid': is_valid,
            'errors': errors if not is_valid else []
        })
    
    except Exception as e:
        logger.error(f"Error validating flow: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/flows/export/<flow_id>', methods=['GET'])
@limiter.limit("20 per minute")
def api_export_flow(flow_id):
    """API: Esporta un flusso come YAML"""
    flow_data = FlowManager.load_flow(flow_id)
    if not flow_data:
        return jsonify({'success': False, 'error': 'Flow not found'}), 404
    
    yaml_content = yaml.dump(flow_data, default_flow_style=False, allow_unicode=True, sort_keys=False)
    
    return yaml_content, 200, {
        'Content-Type': 'application/x-yaml',
        'Content-Disposition': f'attachment; filename="{flow_id}.yaml"'
    }

# Health check
@app.route('/health')
@limiter.exempt
def health_check():
    """Endpoint per health check"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'flows_count': len(FlowManager.get_all_flows()),
        'admin_mode': app.config['ADMIN_MODE']
    })

if __name__ == '__main__':
    # In produzione usa gunicorn o uwsgi
    app.run(
        host='0.0.0.0',
        port=int(os.getenv('PORT', 5000)),
        debug=app.config['DEBUG']
    )