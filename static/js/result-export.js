// result-export.js — Esporta in PDF il risultato di un flow (pagina /output).
// Due modalità: percorso completo (metadati + Domanda→Risposta + risultato) e solo risultato.
// Generazione client-side con jsPDF + jspdf-autotable (caricati in output.html).

(function () {
    'use strict';

    function notify(msg, type) {
        if (typeof showNotification === 'function') {
            showNotification(msg, type || 'success');
        } else {
            console.log(msg);
        }
    }

    // I font standard di jsPDF (Helvetica/WinAnsi) gestiscono solo Latin-1: i caratteri
    // Unicode oltre U+00FF (bullet, frecce, virgolette curve, dash tipografici) causano
    // testo "s p a z i a t o" e glifi spuri. Normalizziamo in ASCII e togliamo i residui.
    function cleanText(s) {
        if (s == null) return '';
        let t = String(s).normalize('NFC');
        const map = {
            ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', '​': '',
            '‘': "'", '’': "'", '‚': "'", '‛': "'",
            '“': '"', '”': '"', '„': '"',
            '–': '-', '—': '-', '−': '-',
            '•': '-', '▪': '-', '●': '-', '◦': '-', '‣': '-', '⁃': '-', '·': '-',
            '…': '...', '→': '->', '⇒': '=>', '←': '<-',
            '✓': 'v', '✔': 'v', '✗': 'x', '«': '"', '»': '"'
        };
        t = t.replace(/[    ​‘’‚‛“”„–—−•▪●◦‣⁃·…→⇒←✓✔✗«»]/g, ch => map[ch] || '');
        // normalizza spazi Unicode "esotici" in spazio normale (evita parole fuse)
        t = t.replace(/[  -   　]/g, ' ');
        // rimuove ogni eventuale carattere ancora fuori dal set Latin-1
        t = t.replace(/[^\x00-\xFF]/g, '');
        return t;
    }

    // Quando è attivo il font Unicode incorporato: mantieni i glifi reali (bullet, frecce,
    // dash, accentate) e togli solo invisibili e caratteri fuori dal subset del font.
    function minimalClean(s) {
        if (s == null) return '';
        return String(s)
            .normalize('NFC')
            .replace(/[  -   　]/g, ' ')
            .replace(/[​-‍﻿]/g, '')
            .replace(/[^\t\n\r\x20-ſ‐-⁯₠-₿™←-⇿−■-◿✓-✗]/g, '');
    }

    // Registra il font DejaVu sul documento; ritorna 'DejaVuSans' se ok, altrimenti 'helvetica'.
    function registerFont(doc) {
        const F = window.FM_FONTS;
        if (!F || !F.files) return 'helvetica';
        try {
            doc.addFileToVFS('DejaVuSans-normal.ttf', F.files['DejaVuSans-normal.ttf']);
            doc.addFont('DejaVuSans-normal.ttf', F.name, 'normal');
            doc.addFileToVFS('DejaVuSans-bold.ttf', F.files['DejaVuSans-bold.ttf']);
            doc.addFont('DejaVuSans-bold.ttf', F.name, 'bold');
            return F.name;
        } catch (e) {
            console.warn('Registrazione font fallita, uso Helvetica:', e);
            return 'helvetica';
        }
    }

    function slugify(s) {
        return (s || 'flow')
            .toString()
            .toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60) || 'flow';
    }

    function pageContext() {
        const page = document.querySelector('.output-page');
        return {
            flowId: page ? page.dataset.flowId : '',
            nodeId: page ? page.dataset.nodeId : '',
            title: (document.querySelector('.output-title')?.textContent || 'Risultato').trim(),
            content: (document.getElementById('markdown-content')?.innerText || '').trim()
        };
    }

    function loadRun(flowId, nodeId) {
        try {
            const raw = sessionStorage.getItem(`flowRun:${flowId}:${nodeId}`);
            if (!raw) return null;
            const data = JSON.parse(raw);
            return Array.isArray(data.steps) && data.steps.length ? data.steps : null;
        } catch (e) {
            return null;
        }
    }

    async function fetchMetadata(flowId) {
        if (!flowId) return {};
        try {
            const res = await fetch(window.STATIC_EXPORT
                ? (window.APP_BASE || '') + `/api/flows/${flowId}.json`
                : (window.APP_BASE || '') + `/api/flows/${flowId}`);
            if (!res.ok) return {};
            const data = await res.json();
            // L'API risponde { success, flow: { metadata, nodes, ... } }
            const flow = (data && data.flow) ? data.flow : data;
            return (flow && flow.metadata) ? flow.metadata : {};
        } catch (e) {
            return {};
        }
    }

    async function exportResultPdf(includePath) {
        const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
        if (!jsPDFCtor) {
            notify('⚠️ Libreria PDF non caricata', 'error');
            return;
        }

        const ctx = pageContext();
        const meta = await fetchMetadata(ctx.flowId);
        const rawFlowName = meta.name || ctx.title;

        let steps = null;
        if (includePath) {
            steps = loadRun(ctx.flowId, ctx.nodeId);
            if (!steps) {
                notify('ℹ️ Percorso non disponibile per questo risultato: esporto solo il risultato.', 'warning');
            }
        }

        // Palette coerente con la pagina (ECL / europa.eu)
        const EU_BLUE = [0, 68, 148];
        const EU_YELLOW = [255, 214, 23];
        const INK = [46, 50, 54];
        const MUTED = [120, 126, 133];
        const BADGE_BG = [234, 240, 248];

        const doc = new jsPDFCtor({ unit: 'pt', format: 'a4' });
        const FONT = registerFont(doc);                 // 'DejaVuSans' se incorporato, else 'helvetica'
        const prep = FONT !== 'helvetica' ? minimalClean : cleanText;
        const flowName = prep(rawFlowName);
        const margin = 48;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const maxWidth = pageWidth - margin * 2;
        const footerSpace = 46;
        let y = margin;

        const ensureSpace = (needed) => {
            if (y + needed > pageHeight - footerSpace) {
                doc.addPage();
                y = margin;
            }
        };

        const sectionHeading = (label) => {
            ensureSpace(34);
            doc.setFont(FONT, 'bold');
            doc.setFontSize(12);
            doc.setTextColor.apply(doc, EU_BLUE);
            doc.text(label, margin, y);
            y += 7;
            doc.setDrawColor.apply(doc, EU_BLUE);
            doc.setLineWidth(1);
            doc.line(margin, y, margin + 28, y);
            y += 18;
        };

        // --- Banda intestazione blu UE con titolo del risultato ---
        const titleLines = doc.splitTextToSize(prep(ctx.title), maxWidth);
        const bandH = 30 + 14 + titleLines.length * 22 + 18;
        doc.setFillColor.apply(doc, EU_BLUE);
        doc.rect(0, 0, pageWidth, bandH, 'F');
        doc.setFillColor.apply(doc, EU_YELLOW);
        doc.rect(0, bandH, pageWidth, 3, 'F'); // accento giallo

        doc.setFont(FONT, 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(255, 255, 255);
        doc.text((flowName || 'Flow Manager').toUpperCase(), margin, 34);

        doc.setFontSize(19);
        doc.setTextColor(255, 255, 255);
        doc.text(titleLines, margin, 56);

        y = bandH + 28;

        // --- Percorso (opzionale) ---
        if (steps && steps.length && typeof doc.autoTable === 'function') {
            sectionHeading('Percorso');
            doc.autoTable({
                startY: y,
                margin: { left: margin, right: margin },
                head: [['#', 'Domanda', 'Risposta scelta']],
                body: steps.map((s, i) => [i + 1, prep(s.question), prep(s.answer)]),
                styles: { font: FONT, fontSize: 9.5, cellPadding: 7, overflow: 'linebreak', valign: 'top', textColor: INK, lineColor: [223, 226, 230], lineWidth: 0.5 },
                headStyles: { fillColor: EU_BLUE, textColor: 255, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: BADGE_BG },
                columnStyles: { 0: { cellWidth: 26, halign: 'center' }, 2: { cellWidth: 160 } },
                theme: 'striped'
            });
            y = doc.lastAutoTable.finalY + 26;
        }

        // --- Risultato ---
        sectionHeading('Risultato');
        doc.setFont(FONT, 'normal');
        doc.setFontSize(10.5);
        doc.setTextColor.apply(doc, INK);
        const lines = doc.splitTextToSize(prep(ctx.content) || '(nessun contenuto)', maxWidth);
        const lineHeight = 15;
        lines.forEach((line) => {
            ensureSpace(lineHeight);
            doc.text(line, margin, y);
            y += lineHeight;
        });

        // --- Footer su ogni pagina: linea + "Flow Manager" + pagina i/n ---
        const pageCount = doc.internal.getNumberOfPages();
        for (let p = 1; p <= pageCount; p++) {
            doc.setPage(p);
            const fy = pageHeight - 26;
            doc.setDrawColor(223, 226, 230);
            doc.setLineWidth(0.5);
            doc.line(margin, fy, pageWidth - margin, fy);
            doc.setFont(FONT, 'normal');
            doc.setFontSize(8);
            doc.setTextColor.apply(doc, MUTED);
            doc.text('Flow Manager', margin, fy + 13);
            doc.text(`Pagina ${p} di ${pageCount}`, pageWidth - margin, fy + 13, { align: 'right' });
        }

        const suffix = (steps && steps.length) ? 'percorso' : 'risultato';
        doc.save(`${slugify(flowName)}-${suffix}.pdf`);
        notify('📄 PDF generato.');
    }

    window.exportResultPdf = exportResultPdf;
})();
