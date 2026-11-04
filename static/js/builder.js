let builderFlowState = {
    nodes: {},
    startNode: '',
    metadata: {}
};

document.addEventListener('DOMContentLoaded', function() {
    initializeBuilder();
});

function initializeBuilder() {
    // Carica i dati del flusso se presenti
    if (window.flowData) {
        builderFlowState = {
            nodes: window.flowData.nodes || {},
            startNode: window.flowData.start_node || '',
            metadata: window.flowData.metadata || {}
        };
        renderFlow();
    }

    // Aggiungi evento per creare un nuovo nodo
    const canvas = document.getElementById('flow-canvas');
    canvas.addEventListener('click', (e) => {
        if (e.target === canvas) {
            addNode();
        }
    });
}

function renderFlow() {
    const canvas = document.getElementById('flow-canvas');
    canvas.innerHTML = '';

    // Renderizza ogni nodo
    Object.keys(builderFlowState.nodes).forEach(nodeId => {
        const node = builderFlowState.nodes[nodeId];
        const nodeElement = document.createElement('div');
        nodeElement.className = `node ${node.type}-node`;
        nodeElement.dataset.nodeId = nodeId;
        nodeElement.style.position = 'absolute';
        nodeElement.style.left = `${Math.random() * (canvas.offsetWidth - 200)}px`; // Posizione casuale per demo
        nodeElement.style.top = `${Math.random() * (canvas.offsetHeight - 100)}px`;
        nodeElement.innerHTML = `
            <h3>${node.type === 'question' ? node.text : node.title}</h3>
            <p>${node.type === 'question' ? 'Domanda' : 'Output'}</p>
        `;
        nodeElement.onclick = () => editNode(nodeId);
        canvas.appendChild(nodeElement);
    });

    // Evidenzia il nodo iniziale
    if (builderFlowState.startNode) {
        const startNodeElement = canvas.querySelector(`[data-node-id="${builderFlowState.startNode}"]`);
        if (startNodeElement) {
            startNodeElement.classList.add('start-node');
        }
    }
}

function addNode() {
    const nodeId = prompt('Inserisci un ID univoco per il nodo:');
    if (!nodeId || nodeId.includes(' ') || builderFlowState.nodes[nodeId]) {
        showNotification('⚠️ ID non valido o già in uso', 'error');
        return;
    }

    builderFlowState.nodes[nodeId] = {
        type: 'question',
        text: 'Nuova Domanda',
        answers: []
    };
    if (!builderFlowState.startNode) {
        builderFlowState.startNode = nodeId;
    }
    renderFlow();
    editNode(nodeId);
}

function editNode(nodeId) {
    const node = builderFlowState.nodes[nodeId];
    if (!node) return;

    document.getElementById('node-editor').classList.remove('hidden');
    document.getElementById('node-id').value = nodeId;
    document.getElementById('node-type').value = node.type;
    document.getElementById('node-text').value = node.type === 'question' ? node.text : node.title;
    document.getElementById('node-content').value = node.content || '';
    document.getElementById('node-content').classList.toggle('hidden', node.type === 'question');
    document.getElementById('answers-container').classList.toggle('hidden', node.type !== 'question');

    // Renderizza le risposte per nodi di tipo question
    const answersList = document.getElementById('answers-list');
    answersList.innerHTML = '';
    if (node.type === 'question') {
        (node.answers || []).forEach((answer, index) => {
            const answerElement = document.createElement('div');
            answerElement.className = 'answer-item';
            answerElement.innerHTML = `
                <input type="text" value="${answer.label}" placeholder="Etichetta risposta">
                <select>
                    <option value="">Seleziona nodo successivo</option>
                    ${Object.keys(builderFlowState.nodes).map(id => `<option value="${id}" ${answer.next === id ? 'selected' : ''}>${id}</option>`).join('')}
                </select>
                <button onclick="removeAnswer(${index}, '${nodeId}')">Rimuovi</button>
            `;
            answersList.appendChild(answerElement);
        });
    }
}

function addAnswer() {
    const nodeId = document.getElementById('node-id').value;
    const node = builderFlowState.nodes[nodeId];
    if (node && node.type === 'question') {
        node.answers = node.answers || [];
        node.answers.push({ label: 'Nuova Risposta', next: '' });
        editNode(nodeId);
    }
}

function removeAnswer(index, nodeId) {
    const node = builderFlowState.nodes[nodeId];
    if (node && node.type === 'question') {
        node.answers.splice(index, 1);
        editNode(nodeId);
    }
}

function saveNode() {
    const nodeId = document.getElementById('node-id').value;
    const nodeType = document.getElementById('node-type').value;
    const nodeText = document.getElementById('node-text').value;
    const nodeContent = document.getElementById('node-content').value;

    if (!nodeId || !nodeText) {
        showNotification('⚠️ ID e testo/titolo sono obbligatori', 'error');
        return;
    }

    const node = builderFlowState.nodes[nodeId] || {};
    node.type = nodeType;
    if (nodeType === 'question') {
        node.text = nodeText;
        node.answers = [];
        const answerItems = document.querySelectorAll('#answers-list .answer-item');
        node.answers = Array.from(answerItems).map(item => ({
            label: item.querySelector('input').value,
            next: item.querySelector('select').value
        }));
        delete node.content;
        delete node.title;
    } else {
        node.title = nodeText;
        node.content = nodeContent;
        delete node.answers;
        delete node.text;
    }

    builderFlowState.nodes[nodeId] = node;
    document.getElementById('node-editor').classList.add('hidden');
    renderFlow();
}

async function saveFlow() {
    try {
        const flowData = {
            start_node: builderFlowState.startNode,
            metadata: builderFlowState.metadata,
            nodes: builderFlowState.nodes
        };
        const response = await fetch(appUrl(`/api/flows/${window.flowId || 'new_' + Date.now()}`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: window.flowId || 'new_' + Date.now(), flow: flowData })
        });
        const data = await response.json();
        if (data.success) {
            showNotification('✅ Flusso salvato con successo!');
            if (!window.flowId) {
                window.location.href = appUrl(`/builder/${data.flow_id}`);
            }
        } else {
            showNotification(`⚠️ Errore nel salvataggio: ${data.error || data.errors.join(', ')}`, 'error');
        }
    } catch (error) {
        console.error('Errore nel salvataggio del flusso:', error);
        showNotification('⚠️ Errore di connessione durante il salvataggio', 'error');
    }
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}