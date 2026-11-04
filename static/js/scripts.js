let flowViewerState = null; // Stato globale per il visualizzatore

// Prefisso dell'app (vuoto in Flask alla radice, '/flow-manager' su GitHub Pages)
function appUrl(path) {
    let p = (window.APP_BASE || '') + path;
    // Nella demo statica ogni pagina e' una cartella con index.html
    if (window.STATIC_EXPORT && !p.endsWith('/') && !/\.[a-z0-9]+$/i.test(p)) p += '/';
    return p;
}

function showConfirmDialog(message, onConfirm, onCancel) {
    // Rimuovi eventuali dialog precedenti
    const existingDialog = document.querySelector('.confirm-dialog-overlay');
    if (existingDialog) existingDialog.remove();

    const overlay = document.createElement('div');
    overlay.className = 'confirm-dialog-overlay';
    overlay.innerHTML = `
        <div class="confirm-dialog">
            <div class="confirm-dialog-content">
                <i class="fas fa-question-circle"></i>
                <p>${message}</p>
            </div>
            <div class="confirm-dialog-actions">
                <button class="btn btn-secondary confirm-cancel">Annulla</button>
                <button class="btn btn-primary confirm-ok">Conferma</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Event listeners
    overlay.querySelector('.confirm-ok').addEventListener('click', () => {
        overlay.remove();
        if (onConfirm) onConfirm();
    });

    overlay.querySelector('.confirm-cancel').addEventListener('click', () => {
        overlay.remove();
        if (onCancel) onCancel();
    });

    // Chiudi cliccando fuori
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
            if (onCancel) onCancel();
        }
    });
}

// Helper function to find the longest path to an output node
function getLongestPathToOutput(nodes, startNode, memo = new Map()) {
    if (!nodes[startNode]) return 0;
    if (memo.has(startNode)) return memo.get(startNode);
    
    const node = nodes[startNode];
    if (node.type === 'output') return 1;
    
    if (node.type !== 'question' || !node.answers) return 0;
    
    let maxLength = 0;
    for (const answer of node.answers) {
        if (answer.next && nodes[answer.next]) {
            const pathLength = 1 + getLongestPathToOutput(nodes, answer.next, memo);
            maxLength = Math.max(maxLength, pathLength);
        }
    }
    
    memo.set(startNode, maxLength);
    return maxLength;
}

function initThemeToggle() {
    const btn = document.getElementById('theme-toggle');
    const icon = document.getElementById('theme-icon');
    if (!btn || !icon) return;

    function getEffectiveTheme() {
        const saved = localStorage.getItem('theme');
        if (saved) return saved;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function updateUI(theme) {
        const isDark = theme === 'dark';
        icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
        btn.setAttribute('aria-pressed', String(isDark));
        btn.setAttribute('aria-label', isDark ? 'Attiva modalità chiara' : 'Attiva modalità scura');
    }

    updateUI(getEffectiveTheme());

    btn.addEventListener('click', function() {
        const next = getEffectiveTheme() === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', next);
        document.documentElement.setAttribute('data-theme', next);
        updateUI(next);
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
        if (!localStorage.getItem('theme')) {
            updateUI(e.matches ? 'dark' : 'light');
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    initThemeToggle();

    // Inizializza ricerca e filtri per index.html
    const searchInput = document.getElementById('search-flows');
    const categoryFilter = document.getElementById('category-filter');

    if (searchInput && categoryFilter) {
        function filterFlows() {
            const searchTerm = searchInput.value.toLowerCase();
            const selectedCategory = categoryFilter.value;

            document.querySelectorAll('.category-section').forEach(section => {
                const category = section.dataset.category;
                let hasVisibleFlows = false;

                if (selectedCategory && category !== selectedCategory) {
                    section.style.display = 'none';
                    return;
                }

                section.querySelectorAll('.flow-card').forEach(card => {
                    const searchText = card.dataset.searchText;
                    const matchesSearch = !searchTerm || searchText.includes(searchTerm);

                    if (matchesSearch) {
                        card.style.display = 'block';
                        hasVisibleFlows = true;
                    } else {
                        card.style.display = 'none';
                    }
                });

                section.style.display = hasVisibleFlows ? 'block' : 'none';
            });
        }

        searchInput.addEventListener('input', filterFlows);
        categoryFilter.addEventListener('change', filterFlows);
    }

    // Inizializza dropzone per l'importazione in index.html
    const dropzone = document.getElementById('import-dropzone');
    const fileInput = document.getElementById('import-file');

    if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('dragover');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            handleFileImport(e.dataTransfer.files[0]);
        });

        fileInput.addEventListener('change', (e) => {
            handleFileImport(e.target.files[0]);
        });
    }

    // Inizializza il visualizzatore di flussi per flow.html
    const flowViewer = document.querySelector('.flow-viewer-container');
    if (flowViewer) {
        initializeFlowViewer();
    }

    // Configura il renderer personalizzato per marked
    if (typeof marked !== 'undefined') {
        const renderer = new marked.Renderer();
        renderer.heading = function(text, level) {
            return `<h${level} class="markdown-heading markdown-heading-${level}">${text}</h${level}>`;
        };
        renderer.paragraph = function(text) {
            return `<p class="markdown-paragraph">${text}</p>`;
        };
        renderer.list = function(body, ordered) {
            const tag = ordered ? 'ol' : 'ul';
            return `<${tag} class="markdown-list markdown-${tag}">${body}</${tag}>`;
        };
        renderer.listitem = function(text) {
            return `<li class="markdown-list-item">${text}</li>`;
        };
        renderer.table = function(header, body) {
            return `<table class="markdown-table"><thead>${header}</thead><tbody>${body}</tbody></table>`;
        };
        renderer.tablerow = function(content) {
            return `<tr class="markdown-table-row">${content}</tr>`;
        };
        renderer.tablecell = function(content, flags) {
            const tag = flags.header ? 'th' : 'td';
            const align = flags.align ? ` style="text-align: ${flags.align}"` : '';
            return `<${tag} class="markdown-table-cell"${align}>${content}</${tag}>`;
        };
        renderer.code = function(code, lang) {
            return `<pre class="markdown-code"><code class="language-${lang || ''}">${code}</code></pre>`;
        };
        marked.setOptions({ renderer });
    }
});

// Funzioni per index.html
function showQuickStart() {
    showModal('Guida Rapida', `
        <div class="quick-start">
            <h3>Benvenuto in Flow Manager!</h3>
            <div class="steps">
                <div class="step">
                    <div class="step-number">1</div>
                    <h4>Scegli o Crea</h4>
                    <p>Seleziona un flusso esistente o creane uno nuovo con il Builder</p>
                </div>
                <div class="step">
                    <div class="step-number">2</div>
                    <h4>Personalizza</h4>
                    <p>Modifica domande, risposte e contenuti secondo le tue esigenze</p>
                </div>
                <div class="step">
                    <div class="step-number">3</div>
                    <h4>Esegui</h4>
                    <p>Avvia il flusso e naviga attraverso le domande interattive</p>
                </div>
                <div class="step">
                    <div class="step-number">4</div>
                    <h4>Esporta</h4>
                    <p>Scarica i tuoi flussi in formato YAML per riutilizzarli</p>
                </div>
            </div>
        </div>
    `);
}

async function duplicateFlow(flowId) {
    if (confirm('Vuoi duplicare questo flusso?')) {
        try {
            const response = await fetch(appUrl(`/api/flows/${flowId}`));
            const data = await response.json();
            if (data.success) {
                const newFlow = data.flow;
                newFlow.metadata.name += ' (Copia)';
                const newId = flowId + '_copy_' + Date.now();

                const createResponse = await fetch(appUrl('/api/flows'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: newId, flow: newFlow })
                });
                const createData = await createResponse.json();
                if (createData.success) {
                    showNotification('✅ Flusso duplicato con successo!');
                    location.reload();
                } else {
                    showNotification(`⚠️ Errore nella duplicazione: ${createData.error || createData.errors.join(', ')}`, 'error');
                }
            } else {
                showNotification(`⚠️ Errore nel recupero del flusso: ${data.error}`, 'error');
            }
        } catch (error) {
            console.error('Errore nella duplicazione:', error);
            showNotification('⚠️ Errore di connessione durante la duplicazione', 'error');
        }
    }
}

async function exportFlow(flowId) {
    try {
        window.location.href = appUrl(`/api/flows/export/${flowId}`);
    } catch (error) {
        console.error('Errore nell\'esportazione:', error);
        showNotification('⚠️ Errore di connessione durante l\'esportazione', 'error');
    }
}

async function deleteFlow(flowId) {
    if (confirm('Sei sicuro di voler eliminare questo flusso?')) {
        try {
            const response = await fetch(appUrl(`/api/flows/${flowId}`), { method: 'DELETE' });
            const data = await response.json();
            if (data.success) {
                showNotification('🗑️ Flusso eliminato con successo!');
                location.reload();
            } else {
                showNotification(`⚠️ Errore nell'eliminazione: ${data.error}`, 'error');
            }
        } catch (error) {
            console.error('Errore nell\'eliminazione:', error);
            showNotification('⚠️ Errore di connessione durante l\'eliminazione', 'error');
        }
    }
}

async function handleFileImport(file) {
    if (!file || !file.name.match(/\.(yaml|yml)$/)) {
        showNotification('⚠️ Seleziona un file YAML valido', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const content = e.target.result;
            const flowData = jsyaml.load(content);
            const flowId = prompt('Inserisci un ID univoco per il flusso:');

            if (!flowId || flowId.includes(' ')) {
                showNotification('⚠️ L\'ID del flusso non può essere vuoto o contenere spazi', 'error');
                return;
            }

            const response = await fetch(appUrl('/api/flows'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: flowId, flow: flowData })
            });
            const data = await response.json();
            if (data.success) {
                showNotification('✅ Flusso importato con successo!');
                location.reload();
            } else {
                showNotification(`⚠️ Errore durante l'importazione: ${data.error || data.errors.join(', ')}`, 'error');
            }
        } catch (error) {
            console.error('Errore nel parsing YAML:', error);
            showNotification('⚠️ Errore nel parsing del file YAML', 'error');
        }
    };
    reader.readAsText(file);
}

// Funzioni per flow.html
function initializeFlowViewer() {
    const flowViewer = document.querySelector('.flow-viewer-container');
    if (!flowViewer) {
        console.error('Elemento .flow-viewer-container non trovato nel DOM.');
        showNotification('⚠️ Errore: Contenitore del flusso non trovato', 'error');
        return;
    }

    try {
        let nodesJson = '{}';
        if (flowViewer.dataset.nodes) {
            nodesJson = atob(flowViewer.dataset.nodes);
        }
        flowViewerState = {
            flowId: flowViewer.dataset.flowId || '',
            currentNode: flowViewer.dataset.startNode || '',
            history: [],
            nodes: JSON.parse(nodesJson),
            startNode: flowViewer.dataset.startNode || ''
        };
        //console.log('Flow Viewer State:', flowViewerState); // Log per debug
    } catch (parseError) {
        console.error('Errore nel parsing dei dati del flusso:', parseError);
        showNotification('⚠️ Errore nel caricamento dei dati del flusso.', 'error');
        return;
    }

    if (!flowViewerState.flowId || !flowViewerState.currentNode || !Object.keys(flowViewerState.nodes).length) {
        console.error('Dati del flusso non validi:', flowViewerState);
        showNotification('⚠️ Errore: Dati del flusso non validi o mancanti', 'error');
        return;
    }

    loadNode(flowViewerState.currentNode);
}

async function loadNode(nodeId) {
    if (!flowViewerState) {
        console.error('Stato del flusso non inizializzato');
        showNotification('⚠️ Stato del flusso non inizializzato', 'error');
        showLoading(false);  // ← Questo viene chiamato
        return;
    }

    showLoading(true);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
            throw new Error('Request timeout');
        }, 5000); // Timeout di 5 secondi

        let data;
        if (window.STATIC_EXPORT) {
            // Demo statica: i nodi sono gia' nella pagina, niente API
            const all = flowViewerState.nodes;
            const n = all[nodeId];
            if (n) {
                // come l'API: id del nodo e tipo/titolo del nodo successivo
                const node = JSON.parse(JSON.stringify(n));
                node.id = nodeId;
                (node.answers || []).forEach(a => {
                    const nx = all[a.next];
                    if (nx) { a.next_type = nx.type; a.next_title = nx.title || nx.text || ''; }
                });
                data = { success: true, node };
            } else {
                data = { success: false };
            }
        } else {
            const response = await fetch(appUrl(`/api/flows/${flowViewerState.flowId}/node/${nodeId}`), {
                signal: controller.signal
            });
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            data = await response.json();
        }
        clearTimeout(timeoutId);

        if (data.success) {
            const node = data.node;
            flowViewerState.currentNode = nodeId;
            updateProgress();
            updateNavigationHistory();

            if (node.type === 'question') {
                showQuestion(node);
            } else if (node.type === 'output') {
                // Conserva il percorso seguito attraverso il redirect verso /output
                // (la history vive solo client-side e andrebbe persa al cambio pagina).
                try {
                    const steps = flowViewerState.history.map(h => ({
                        question: flowViewerState.nodes[h.node]?.text || h.node,
                        answer: h.answer
                    }));
                    sessionStorage.setItem(
                        `flowRun:${flowViewerState.flowId}:${nodeId}`,
                        JSON.stringify({ steps, ts: Date.now() })
                    );
                } catch (e) {
                    console.warn('Impossibile salvare il percorso del flow:', e);
                }
                window.location.href = appUrl(`/output/${flowViewerState.flowId}/${nodeId}`);
            }
        }
    } catch (error) {
        console.error('Errore nel caricamento del nodo:', error);
        showNotification(`⚠️ Errore di connessione o timeout: ${error.message}`, 'error');
    } finally {
        showLoading(false);  // ← Questo DOVREBBE essere chiamato sempre
    }
}

function showQuestion(node) {
    if (!flowViewerState) return;

    //console.log('Mostrando domanda:', node); // Debug

    // Nascondi loading
    showLoading(false);

    // Mostra question container
    const questionContainer = document.getElementById('question-container');
    const outputContainer = document.getElementById('output-container');
    
    if (questionContainer) questionContainer.classList.remove('hidden');
    if (outputContainer) outputContainer.classList.add('hidden');

    const questionText = document.getElementById('question-text');
    if (questionText) questionText.textContent = node.text;

    const answersContainer = document.getElementById('answers-container');
    if (!answersContainer) {
        console.error('answers-container non trovato!');
        return;
    }
    
    answersContainer.innerHTML = '';

    node.answers.forEach((answer, index) => {
        const button = document.createElement('button');
        button.className = 'answer-button';
        button.innerHTML = `
            <span class="answer-number">${index + 1}</span>
            <span class="answer-label">${answer.label}</span>
            ${answer.next_type === 'output' ? '<i class="fas fa-flag-checkered"></i>' : '<i class="fas fa-arrow-right"></i>'}
        `;
        button.onclick = () => selectAnswer(answer.next, answer.label);

        if (index < 9) {
            button.setAttribute('data-key', index + 1);
        }

        answersContainer.appendChild(button);

        setTimeout(() => {
            button.classList.add('show');
        }, index * 100);
    });
}

function showOutput(node) {
    if (!flowViewerState) return;

    document.getElementById('question-container').classList.add('hidden');
    document.getElementById('output-container').classList.remove('hidden');

    document.getElementById('output-title').innerHTML = `
        <i class="fas fa-flag-checkered"></i> ${node.title}
    `;

    const htmlContent = marked.parse(node.content);
    document.getElementById('output-content').innerHTML = htmlContent;

    document.querySelectorAll('pre code').forEach((block) => {
        if (typeof hljs !== 'undefined') {
            hljs.highlightElement(block);
        }
    });
}

function selectAnswer(nextNode, answerLabel) {
    if (!flowViewerState) return;

    flowViewerState.history.push({
        node: flowViewerState.currentNode,
        answer: answerLabel
    });

    loadNode(nextNode);
}

function restartFlow() {
    if (!flowViewerState) return;

    if (flowViewerState.history.length > 0) {
        // Mostra conferma con notifica custom invece di confirm()
        showConfirmDialog(
            'Vuoi davvero ricominciare dall\'inizio?',
            () => {
                // Conferma: resetta il flusso
                flowViewerState.currentNode = flowViewerState.startNode;
                flowViewerState.history = [];
                loadNode(flowViewerState.currentNode);
            },
            () => {
                // Annulla: non fare nulla
                //console.log('Restart annullato');
            }
        );
        return;
    }

    // Se non c'è cronologia, riavvia direttamente
    flowViewerState.currentNode = flowViewerState.startNode;
    flowViewerState.history = [];
    loadNode(flowViewerState.currentNode);
}

function goBack() {
    if (!flowViewerState) return;

    if (flowViewerState.history.length > 0) {
        const lastStep = flowViewerState.history.pop();
        loadNode(lastStep.node);
    }
}

function updateProgress() {
    if (!flowViewerState) return;

    // Se il nodo corrente è di tipo output, imposta il progresso al 100%
    if (flowViewerState.nodes[flowViewerState.currentNode]?.type === 'output') {
        document.getElementById('progress-bar').style.width = '100%';
        return;
    }

    // Calcola il progresso in base alla lunghezza della cronologia
    const longestPath = getLongestPathToOutput(flowViewerState.nodes, flowViewerState.startNode);
    const currentStep = flowViewerState.history.length + 1; // +1 per il nodo corrente
    const progress = Math.min((currentStep / Math.max(longestPath, 1)) * 100, 100); // Cap a 100%
    document.getElementById('progress-bar').style.width = `${progress}%`;
}

function updateNavigationHistory() {
    if (!flowViewerState) return;

    const historyContainer = document.getElementById('navigation-history');
    historyContainer.innerHTML = '';

    flowViewerState.history.forEach((step, index) => {
        const stepElement = document.createElement('div');
        stepElement.className = 'history-step';
        stepElement.innerHTML = `
            <span class="step-number">${index + 1}</span>
            <span class="step-answer">${step.answer}</span>
        `;
        stepElement.onclick = () => {
            flowViewerState.history = flowViewerState.history.slice(0, index);
            loadNode(step.node);
        };
        historyContainer.appendChild(stepElement);
    });

    if (flowViewerState.currentNode) {
        const currentStep = document.createElement('div');
        currentStep.className = 'history-step current';
        currentStep.innerHTML = `
            <span class="step-number">${flowViewerState.history.length + 1}</span>
            <span class="step-answer">Attuale</span>
        `;
        historyContainer.appendChild(currentStep);
    }
}

function shareResult() {
    if (!flowViewerState) return;

    const shareUrl = window.location.href;

    if (navigator.share) {
        navigator.share({
            title: document.querySelector('.output-title').textContent,
            text: 'Guarda il mio risultato!',
            url: shareUrl
        });
    } else {
        navigator.clipboard.writeText(shareUrl).then(() => {
            showNotification('📋 Link copiato negli appunti!');
        });
    }
}

function showLoading(show) {
    const loadingContainer = document.getElementById('loading-container');
    if (loadingContainer) {
        //console.log('showLoading chiamato con:', show); // Debug
        if (show) {
            loadingContainer.classList.remove('hidden');
        } else {
            loadingContainer.classList.add('hidden');
        }
    } else {
        console.error('loading-container non trovato!');
    }
}

function editFlow(flowId) {
    window.location.href = appUrl(`/builder/${flowId}`);
}