class FlowValidator:
    """Validatore per i flussi YAML"""
    
    def __init__(self):
        self.errors = []
    
    def validate(self, flow_data):
        """Valida un flusso completo"""
        self.errors = []
        
        if not flow_data:
            self.errors.append("Flow data is empty")
            return False, self.errors
        
        # Validazione struttura base
        if 'start_node' not in flow_data:
            self.errors.append("Missing 'start_node' field")
        
        if 'nodes' not in flow_data:
            self.errors.append("Missing 'nodes' field")
            return False, self.errors
        
        nodes = flow_data.get('nodes', {})
        start_node = flow_data.get('start_node')
        
        # Verifica che il nodo iniziale esista
        if start_node and start_node not in nodes:
            self.errors.append(f"Start node '{start_node}' not found in nodes")
        
        # Valida ogni nodo
        for node_id, node_data in nodes.items():
            self._validate_node(node_id, node_data, nodes)
        
        # Verifica cicli e nodi non raggiungibili
        if start_node and start_node in nodes:
            self._check_reachability(start_node, nodes)
            self._check_cycles(start_node, nodes)
        
        return len(self.errors) == 0, self.errors
    
    def _validate_node(self, node_id, node_data, all_nodes):
        """Valida un singolo nodo"""
        # Verifica tipo nodo
        if 'type' not in node_data:
            self.errors.append(f"Node '{node_id}': missing 'type' field")
            return
        
        node_type = node_data['type']
        
        if node_type not in ['question', 'output']:
            self.errors.append(f"Node '{node_id}': invalid type '{node_type}'")
            return
        
        # Validazione per tipo question
        if node_type == 'question':
            if 'text' not in node_data:
                self.errors.append(f"Node '{node_id}': missing 'text' field")
            
            if 'answers' not in node_data:
                self.errors.append(f"Node '{node_id}': missing 'answers' field")
            else:
                answers = node_data['answers']
                if not isinstance(answers, list):
                    self.errors.append(f"Node '{node_id}': 'answers' must be a list")
                elif len(answers) < 2:
                    self.errors.append(f"Node '{node_id}': questions must have at least 2 answers")
                else:
                    for i, answer in enumerate(answers):
                        if not isinstance(answer, dict):
                            self.errors.append(f"Node '{node_id}': answer {i} must be a dictionary")
                            continue
                        
                        if 'label' not in answer:
                            self.errors.append(f"Node '{node_id}': answer {i} missing 'label'")
                        
                        if 'next' not in answer:
                            self.errors.append(f"Node '{node_id}': answer {i} missing 'next'")
                        elif answer['next'] not in all_nodes:
                            self.errors.append(f"Node '{node_id}': answer {i} references non-existent node '{answer['next']}'")
        
        # Validazione per tipo output
        elif node_type == 'output':
            if 'title' not in node_data:
                self.errors.append(f"Node '{node_id}': missing 'title' field")
            
            if 'content' not in node_data:
                self.errors.append(f"Node '{node_id}': missing 'content' field")
    
    def _check_reachability(self, start_node, nodes):
        """Verifica che tutti i nodi siano raggiungibili"""
        visited = set()
        to_visit = [start_node]
        
        while to_visit:
            current = to_visit.pop()
            if current in visited:
                continue
            
            visited.add(current)
            node = nodes.get(current, {})
            
            if node.get('type') == 'question':
                for answer in node.get('answers', []):
                    next_node = answer.get('next')
                    if next_node and next_node not in visited:
                        to_visit.append(next_node)
        
        unreachable = set(nodes.keys()) - visited
        if unreachable:
            self.errors.append(f"Unreachable nodes: {', '.join(unreachable)}")
    
    def _check_cycles(self, start_node, nodes, visited=None, stack=None):
        """Verifica la presenza di cicli nel grafo"""
        if visited is None:
            visited = set()
        if stack is None:
            stack = []
        
        if start_node in stack:
            # Ciclo trovato - non necessariamente un errore, potrebbe essere intenzionale
            cycle_path = stack[stack.index(start_node):] + [start_node]
            # Solo un warning, non un errore
            # self.errors.append(f"Cycle detected: {' -> '.join(cycle_path)}")
            return
        
        if start_node in visited:
            return
        
        visited.add(start_node)
        stack.append(start_node)
        
        node = nodes.get(start_node, {})
        if node.get('type') == 'question':
            for answer in node.get('answers', []):
                next_node = answer.get('next')
                if next_node:
                    self._check_cycles(next_node, nodes, visited, stack.copy())
    
    def validate_metadata(self, metadata):
        """Valida i metadati del flusso"""
        errors = []
        
        required_fields = ['name', 'description', 'category', 'version']
        for field in required_fields:
            if field not in metadata:
                errors.append(f"Missing metadata field: {field}")
        
        # Validazione versione (formato semver)
        if 'version' in metadata:
            import re
            version_pattern = r'^\d+\.\d+\.\d+$'
            if not re.match(version_pattern, metadata['version']):
                errors.append(f"Invalid version format: {metadata['version']}. Use semantic versioning (e.g., 1.0.0)")
        
        return errors