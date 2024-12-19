export class Dialog {
  private static template = `
    <div class="dialog-overlay">
      <div class="dialog-container">
        <div class="dialog-content">
          <div class="dialog-title"></div>
          <div class="dialog-message"></div>
          <div class="dialog-buttons">
            <button class="dialog-cancel-btn">Cancel</button>
            <button class="dialog-confirm-btn">Confirm</button>
          </div>
        </div>
      </div>
    </div>
  `;

  private static style = `
    .dialog-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.75);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      backdrop-filter: blur(4px);
    }
    .dialog-container {
      background: #21232f;
      border-radius: 12px;
      padding: 24px;
      width: 350px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
    }
    .dialog-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 16px;
      color: #ffffff;
    }
    .dialog-message {
      margin-bottom: 24px;
      line-height: 1.6;
      color: rgba(255, 255, 255, 0.8);
      font-size: 14px;
    }
    .dialog-buttons {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }
    .dialog-confirm-btn {
      padding: 8px 24px;
      background-color: #ff7a00;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s ease;
    }
    .dialog-confirm-btn:hover {
      background-color: #ff8f1f;
      transform: translateY(-1px);
    }
    .dialog-confirm-btn:active {
      transform: translateY(0);
    }
    .dialog-cancel-btn {
      padding: 8px 24px;
      background-color: rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.8);
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s ease;
    }
    .dialog-cancel-btn:hover {
      background-color: rgba(255, 255, 255, 0.15);
      transform: translateY(-1px);
    }
    .dialog-cancel-btn:active {
      transform: translateY(0);
    }
    
    .dialog-overlay {
      animation: fadeIn 0.2s ease;
    }
    .dialog-container {
      animation: slideIn 0.2s ease;
    }
    @keyframes fadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
    @keyframes slideIn {
      from {
        transform: translateY(-20px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
  `;

  private static injectStyles() {
    if (!document.querySelector('#dialog-styles')) {
      const styleSheet = document.createElement('style');
      styleSheet.id = 'dialog-styles';
      styleSheet.textContent = this.style;
      document.head.appendChild(styleSheet);
    }
  }

  static confirm(options: { title?: string; message: string }): Promise<boolean> {
    return new Promise((resolve) => {
      this.injectStyles();

      const container = document.createElement('div');
      container.innerHTML = this.template;
      document.body.appendChild(container);

      const titleEl = container.querySelector('.dialog-title') as HTMLElement;
      const messageEl = container.querySelector('.dialog-message') as HTMLElement;
      const confirmBtn = container.querySelector('.dialog-confirm-btn') as HTMLElement;
      const cancelBtn = container.querySelector('.dialog-cancel-btn') as HTMLElement;

      if (options.title) {
        titleEl.textContent = options.title;
      } else {
        titleEl.style.display = 'none';
      }
      messageEl.textContent = options.message;

      const cleanup = () => {
        document.body.removeChild(container);
      };

      confirmBtn.addEventListener('click', () => {
        cleanup();
        resolve(true);
      });

      cancelBtn.addEventListener('click', () => {
        cleanup();
        resolve(false);
      });
    });
  }

  static alert(options: { title?: string; message: string }): Promise<void> {
    return new Promise((resolve) => {
      this.injectStyles();

      const container = document.createElement('div');
      container.innerHTML = this.template;
      document.body.appendChild(container);

      const titleEl = container.querySelector('.dialog-title') as HTMLElement;
      const messageEl = container.querySelector('.dialog-message') as HTMLElement;
      const confirmBtn = container.querySelector('.dialog-confirm-btn') as HTMLElement;
      const cancelBtn = container.querySelector('.dialog-cancel-btn') as HTMLElement;

      if (options.title) {
        titleEl.textContent = options.title;
      } else {
        titleEl.style.display = 'none';
      }
      messageEl.textContent = options.message;
      cancelBtn.style.display = 'none';

      const cleanup = () => {
        document.body.removeChild(container);
      };

      confirmBtn.addEventListener('click', () => {
        cleanup();
        resolve();
      });
    });
  }
}
