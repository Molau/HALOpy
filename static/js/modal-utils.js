/**
 * Modal Utility Functions for HALOpy (Decision #033)
 * 
 * Thin utility layer on top of standard Bootstrap modals.
 * Provides consistent keyboard handling, button creation, and simple modal helpers.
 * Does NOT wrap or replace Bootstrap - works WITH it.
 */

/**
 * Setup consistent keyboard handling for any Bootstrap modal.
 * Call this ONCE after modal.show().
 * 
 * - Enter key triggers the confirmBtn (unless focus is in textarea/select)
 * - ESC is handled by Bootstrap natively (keyboard: true)
 * - Cleanup: listener is automatically removed when modal is hidden
 * 
 * @param {HTMLElement} modalEl - The .modal element
 * @param {HTMLElement|null} confirmBtn - The primary action button (Enter triggers click on this)
 */
function setupModalKeyboard(modalEl, confirmBtn) {
    function onKeydown(e) {
        if (e.key === 'Enter' && confirmBtn) {
            const tag = document.activeElement?.tagName;
            if (tag !== 'TEXTAREA' && tag !== 'SELECT') {
                e.preventDefault();
                confirmBtn.click();
            }
        }
    }

    modalEl.addEventListener('keydown', onKeydown);

    // Auto-cleanup when modal is hidden
    modalEl.addEventListener('hidden.bs.modal', function cleanup() {
        modalEl.removeEventListener('keydown', onKeydown);
        modalEl.removeEventListener('hidden.bs.modal', cleanup);
    }, { once: true });
}

/**
 * Create standard button HTML enforcing Decision #018 sizing (btn-sm px-3).
 * 
 * @param {string} text - Button label (from i18n, NO fallbacks)
 * @param {string} type - Bootstrap button type: 'primary', 'secondary', 'danger', 'success'
 * @param {object} [options] - Optional settings
 * @param {string} [options.id] - Button id attribute
 * @param {boolean} [options.dismiss] - Add data-bs-dismiss="modal"
 * @returns {string} HTML string for the button
 */
function createModalButton(text, type = 'primary', options = {}) {
    const idAttr = options.id ? ` id="${options.id}"` : '';
    const dismissAttr = options.dismiss ? ' data-bs-dismiss="modal"' : '';
    return `<button type="button" class="btn btn-${type} btn-sm px-3"${idAttr}${dismissAttr}>${text}</button>`;
}

/**
 * Create a standard modal footer with Cancel + OK buttons.
 * 
 * @param {string} cancelText - Cancel button text (from i18n)
 * @param {string} okText - OK button text (from i18n)
 * @param {string} [okType='primary'] - Bootstrap type for OK button
 * @param {string} [okId=null] - ID for the OK button
 * @returns {string} HTML string for the modal-footer content
 */
function createStandardFooter(cancelText, okText, okType = 'primary', okId = null) {
    return createModalButton(cancelText, 'secondary', { dismiss: true }) +
           createModalButton(okText, okType, { id: okId });
}

/**
 * Setup automatic DOM cleanup for a dynamically created modal.
 * Removes the modal element from DOM after it's fully hidden.
 * Also cleans up orphaned backdrops (Bootstrap edge case).
 * 
 * @param {HTMLElement} modalEl - The .modal element to auto-cleanup
 */
function setupModalCleanup(modalEl) {
    modalEl.addEventListener('hidden.bs.modal', function cleanup() {
        modalEl.removeEventListener('hidden.bs.modal', cleanup);
        modalEl.remove();

        // Clean orphaned backdrops if no modals are visible
        setTimeout(() => {
            if (document.querySelectorAll('.modal.show').length === 0) {
                document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
                document.body.classList.remove('modal-open');
                document.body.style.removeProperty('overflow');
                document.body.style.removeProperty('padding-right');
            }
        }, 100);
    }, { once: true });
}

/**
 * Show a simple modal dialog (warning, error, success, info).
 * Creates the modal dynamically, shows it, and cleans up after close.
 * 
 * @param {object} config
 * @param {string} config.title - Modal title
 * @param {string} config.body - HTML content for modal body
 * @param {string} [config.footer] - HTML for footer buttons (uses OK button if omitted)
 * @param {string} [config.okText] - Text for default OK button
 * @param {string} [config.okType='primary'] - Bootstrap type for OK button
 * @param {boolean} [config.loading=false] - If true, no footer, static backdrop
 * @returns {object} { modal, modalEl, hide() }
 */
function showSimpleModal(config) {
    const id = 'modal-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);

    const isLoading = config.loading === true;
    const backdropAttr = isLoading ? 'data-bs-backdrop="static" data-bs-keyboard="false"' : '';
    const closeBtn = isLoading ? '' : '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>';

    let footer = '';
    if (!isLoading) {
        if (config.footer) {
            footer = config.footer;
        } else {
            const okText = config.okText || i18nStrings.common.ok;
            footer = createModalButton(okText, config.okType || 'primary', { dismiss: true });
        }
    }

    const html = `
        <div class="modal fade" id="${id}" tabindex="-1" ${backdropAttr}>
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">${config.title}</h5>
                        ${closeBtn}
                    </div>
                    <div class="modal-body">${config.body}</div>
                    ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
                </div>
            </div>
        </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    const modalEl = document.getElementById(id);
    const modal = new bootstrap.Modal(modalEl);

    setupModalCleanup(modalEl);

    if (!isLoading) {
        // Enter key triggers the first (or only) primary/danger/success button
        const confirmBtn = modalEl.querySelector('.modal-footer .btn-primary, .modal-footer .btn-danger, .modal-footer .btn-success');
        if (confirmBtn) {
            setupModalKeyboard(modalEl, confirmBtn);
        }
    }

    modal.show();

    return {
        modal,
        modalEl,
        hide: () => modal.hide()
    };
}

// ========== Backward-compatible global functions ==========

window.showWarningModal = function(message) {
    return new Promise(resolve => {
        const { modalEl } = showSimpleModal({
            title: i18nStrings.common.warning,
            body: `<p>${message}</p>`
        });
        modalEl.addEventListener('hidden.bs.modal', () => resolve(), { once: true });
    });
};

window.showErrorDialog = function(message) {
    return new Promise(resolve => {
        const { modalEl } = showSimpleModal({
            title: i18nStrings.common.error,
            body: `<p>${message}</p>`,
            okType: 'danger'
        });
        modalEl.addEventListener('hidden.bs.modal', () => resolve(), { once: true });
    });
};

window.showSuccessModal = function(title, message) {
    return new Promise(resolve => {
        const { modalEl } = showSimpleModal({
            title: title,
            body: `<p>${message}</p>`,
            okType: 'success'
        });
        modalEl.addEventListener('hidden.bs.modal', () => resolve(), { once: true });
    });
};

window.showInfoModal = function(title, message) {
    const body = `
        <div class="text-center py-4">
            <div class="spinner-border text-primary mb-3" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mb-0">${message}</p>
        </div>`;
    return showSimpleModal({ title, body, loading: true });
};

window.showConfirmDialog = function(title, message, onConfirm, onCancel) {
    const id = 'confirm-' + Date.now();
    const okId = id + '-ok';

    const footer = createModalButton(i18nStrings.common.cancel, 'secondary', { dismiss: true }) +
                   createModalButton(i18nStrings.common.ok, 'primary', { id: okId });

    const { modal, modalEl } = showSimpleModal({
        title,
        body: `<p>${message}</p>`,
        footer
    });

    let confirmed = false;
    document.getElementById(okId).addEventListener('click', () => {
        confirmed = true;
        modal.hide();
    });
    modalEl.addEventListener('hidden.bs.modal', () => {
        if (confirmed && onConfirm) onConfirm();
        else if (!confirmed && onCancel) onCancel();
    }, { once: true });
};
