/**
 * Unified Modal Manager for HALOpy
 * Provides consistent modal dialogs with proper cleanup and backdrop management
 */

class ModalManager {
    constructor() {
        this.activeModals = new Map();
        this.zIndexCounter = 1050; // Start above Bootstrap's default
    }

    /**
     * Generate unique modal ID
     */
    generateId() {
        return 'modal-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
    }

    /**
     * Create base modal HTML structure
     */
    createBaseModal(id, title, body, footer, options = {}) {
        const {
            size = '',
            backdrop = true,
            keyboard = true,
            centered = true,
            scrollable = false
        } = options;

        const sizeClass = size ? `modal-${size}` : '';
        const centeredClass = centered ? 'modal-dialog-centered' : '';
        const scrollableClass = scrollable ? 'modal-dialog-scrollable' : '';
        const dialogClasses = ['modal-dialog', sizeClass, centeredClass, scrollableClass].filter(Boolean).join(' ');

        const backdropAttr = backdrop === false || backdrop === 'static' ? `data-bs-backdrop="${backdrop}"` : '';
        const keyboardAttr = !keyboard ? 'data-bs-keyboard="false"' : '';

        return `
            <div class="modal fade" id="${id}" tabindex="-1" ${backdropAttr} ${keyboardAttr}>
                <div class="${dialogClasses}">
                    <div class="modal-content">
                        ${title ? `
                            <div class="modal-header">
                                <h5 class="modal-title">${title}</h5>
                                ${backdrop !== 'static' ? '<button type="button" class="btn-close"></button>' : ''}
                            </div>
                        ` : ''}
                        <div class="modal-body">
                            ${body}
                        </div>
                        ${footer ? `
                            <div class="modal-footer">
                                ${footer}
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Show modal and track it
     */
    showModal(id, html, options = {}) {
        // Remove any existing modal with same ID
        this.hideModal(id);

        // Add HTML to DOM
        document.body.insertAdjacentHTML('beforeend', html);
        const modalEl = document.getElementById(id);
        
        // Create Bootstrap modal
        const modal = new bootstrap.Modal(modalEl, {
            backdrop: options.backdrop !== false ? (options.backdrop || 'static') : false,
            keyboard: options.keyboard !== false
        });

        // Set custom z-index if needed
        modalEl.style.zIndex = this.zIndexCounter++;

        // Track the modal
        this.activeModals.set(id, { modal, modalEl });

        // Setup cleanup
        modalEl.addEventListener('hidden.bs.modal', () => {
            this.cleanup(id);
        });

        // Intercept close button clicks to ensure proper cleanup
        const closeButton = modalEl.querySelector('.btn-close');
        if (closeButton) {
            closeButton.addEventListener('click', (e) => {
                e.preventDefault();
                modal.hide();
            });
        }

        modal.show();
        return { modal, modalEl };
    }

    /**
     * Hide modal by ID
     */
    hideModal(id) {
        const modalInfo = this.activeModals.get(id);
        if (modalInfo) {
            modalInfo.modal.hide();
        }
    }

    /**
     * Cleanup modal and backdrop
     */
    cleanup(id) {
        const modalInfo = this.activeModals.get(id);
        if (modalInfo) {
            // Remove modal element
            if (modalInfo.modalEl && modalInfo.modalEl.parentNode) {
                modalInfo.modalEl.remove();
            }

            // Remove from tracking
            this.activeModals.delete(id);

            // Clean up any orphaned backdrops
            setTimeout(() => {
                const backdrops = document.querySelectorAll('.modal-backdrop');
                const visibleModals = document.querySelectorAll('.modal.show');
                
                if (visibleModals.length === 0) {
                    // No visible modals, remove all backdrops
                    backdrops.forEach(backdrop => backdrop.remove());
                    
                    // Reset body styles
                    document.body.classList.remove('modal-open');
                    document.body.style.removeProperty('overflow');
                    document.body.style.removeProperty('padding-right');
                } else if (backdrops.length > visibleModals.length) {
                    // More backdrops than modals, remove excess
                    const excess = backdrops.length - visibleModals.length;
                    for (let i = 0; i < excess; i++) {
                        backdrops[i].remove();
                    }
                }
            }, 150);
        }
    }

    /**
     * Standard button HTML
     */
    createButton(text, type = 'primary', id = null, dismissModal = false) {
        const btnId = id ? `id="${id}"` : '';
        const dismiss = dismissModal ? 'data-bs-dismiss="modal"' : '';
        return `<button type="button" class="btn btn-${type} btn-sm px-3" ${btnId} ${dismiss}>${text}</button>`;
    }

    /**
     * Show confirmation dialog
     */
    showConfirm(title, message, options = {}) {
        const {
            confirmText = options.confirmText || i18nStrings.common.ok,
            cancelText = options.cancelText || i18nStrings.common.cancel,
            confirmType = 'primary'
        } = options;

        return new Promise((resolve) => {
            const id = this.generateId();
            
            const footer = [
                this.createButton(cancelText, 'secondary', null, true),
                this.createButton(confirmText, confirmType, `${id}-confirm`)
            ].join('');

            const html = this.createBaseModal(id, title, `<p>${message}</p>`, footer);
            const { modal, modalEl } = this.showModal(id, html);

            let resolved = false;

            // Confirm button
            document.getElementById(`${id}-confirm`).addEventListener('click', () => {
                resolved = true;
                modal.hide();
                resolve(true);
            });

            // Modal hidden (cancel)
            modalEl.addEventListener('hidden.bs.modal', () => {
                if (!resolved) {
                    resolve(false);
                }
            });
        });
    }

    /**
     * Show warning dialog
     */
    showWarning(message, title = null) {
        return new Promise((resolve) => {
            const modalTitle = title || i18nStrings.common.warning;
            const id = this.generateId();
            
            const okText = i18nStrings.common.ok;
            const footer = this.createButton(okText, 'primary', null, true);
            const html = this.createBaseModal(id, modalTitle, `<p>${message}</p>`, footer);
            
            const { modalEl } = this.showModal(id, html);
            modalEl.addEventListener('hidden.bs.modal', () => resolve());
        });
    }

    /**
     * Show error dialog
     */
    showError(message, title = null) {
        return new Promise((resolve) => {
            const modalTitle = title || i18nStrings.common.error;
            const id = this.generateId();
            
            const okText = i18nStrings.common.ok;
            const footer = this.createButton(okText, 'danger', null, true);
            const html = this.createBaseModal(id, modalTitle, `<p>${message}</p>`, footer);
            
            const { modalEl } = this.showModal(id, html);
            modalEl.addEventListener('hidden.bs.modal', () => resolve());
        });
    }

    /**
     * Show info/loading modal (non-dismissable)
     */
    showLoading(title, message) {
        const id = this.generateId();
        
        const body = `
            <div class="text-center py-4">
                <div class="spinner-border text-primary mb-3" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="mb-0">${message}</p>
            </div>
        `;

        const html = this.createBaseModal(id, title, body, '', {
            backdrop: 'static',
            keyboard: false
        });

        const { modal, modalEl } = this.showModal(id, html, { 
            backdrop: 'static', 
            keyboard: false 
        });

        return { id, modal, modalEl, hide: () => this.hideModal(id) };
    }

    /**
     * Show success modal
     */
    showSuccess(message, title = null) {
        return new Promise((resolve) => {
            const modalTitle = title || i18nStrings.common.success;
            const id = this.generateId();
            
            const okText = i18nStrings.common.ok;
            const footer = this.createButton(okText, 'success', null, true);
            const html = this.createBaseModal(id, modalTitle, `<p>${message}</p>`, footer);
            
            const { modalEl } = this.showModal(id, html);
            modalEl.addEventListener('hidden.bs.modal', () => resolve());
        });
    }

    /**
     * Show custom modal
     */
    showCustom(title, bodyHtml, footerHtml = '', options = {}) {
        const id = this.generateId();
        const html = this.createBaseModal(id, title, bodyHtml, footerHtml, options);
        const { modal, modalEl } = this.showModal(id, html, options);
        
        return { 
            id, 
            modal, 
            modalEl, 
            hide: () => this.hideModal(id),
            cleanup: () => this.cleanup(id)
        };
    }
}

// Create global instance
window.modalManager = new ModalManager();

// Backward compatibility functions
window.showConfirmDialog = (title, message, onConfirm, onCancel) => {
    modalManager.showConfirm(title, message).then(confirmed => {
        if (confirmed && onConfirm) {
            onConfirm();
        } else if (!confirmed && onCancel) {
            onCancel();
        }
    });
};

window.showWarningModal = (message) => {
    return modalManager.showWarning(message);
};
window.showErrorDialog = (message) => {
    return modalManager.showError(message);
};
window.showInfoModal = (title, message) => {
    return modalManager.showLoading(title, message);
};
window.showSuccessModal = (title, message) => {
    return modalManager.showSuccess(message, title);
};