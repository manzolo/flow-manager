document.addEventListener('DOMContentLoaded', function() {
    const markdownContent = document.getElementById('markdown-content');
    const content = markdownContent.innerHTML; // Content is already in the DOM
    markdownContent.innerHTML = marked.parse(content); // Parse Markdown
    document.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block); // Highlight code blocks
    });
});

