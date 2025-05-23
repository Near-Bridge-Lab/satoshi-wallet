interface DialogOptions {
  title: string;
  message: string;
  dangerouslyUseHTML?: boolean;
  closable?: boolean;
}

export class Dialog {
  private static template = `
    <div class="dialog-overlay">
      <div class="dialog-container">
        <div class="dialog-content">
          <div class="dialog-title"></div>
          <div class="dialog-message"></div>
          <div class="dialog-buttons">
            <button class="dialog-cancel-btn">Cancel</button>
            <button class="dialog-confirm-btn">OK</button>
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
      background: #131313;
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
    .dialog-alert .dialog-buttons {
      justify-content: center;
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
    .option-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .option-item {
      display: flex;
      align-items: center;
      gap: 12px;
      color: #fff;
      border: 1px solid transparent;
      background-color: hsla(0, 0%, 100%, .05);
      border-radius: 8px;
      padding: 8px 16px;
      transition: all 0.15s ease;
      cursor: pointer;
      font-size: 14px;
      font-weight: bold;
      &:hover {
        border-color: #ff7a00;
        color: #ff7a00;
        background-color: hsla(0, 0%, 100%, .08);
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

  static alert(options: DialogOptions) {
    const messageEl = options.dangerouslyUseHTML
      ? { dangerouslySetInnerHTML: { __html: options.message } }
      : { children: options.message };

    return new Promise<void>((resolve) => {
      this.injectStyles();

      const container = document.createElement('div');
      container.innerHTML = this.template;
      container.querySelector('.dialog-overlay')?.classList.add('dialog-alert');

      if (options.closable === false) {
        const overlay = container.querySelector('.dialog-overlay') as HTMLElement;
        overlay.style.pointerEvents = 'none';
        const dialogContainer = container.querySelector('.dialog-container') as HTMLElement;
        dialogContainer.style.pointerEvents = 'auto';
      }

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
      messageEl.innerHTML = options.message;
      cancelBtn.style.display = 'none';

      if (options.closable === false) {
        confirmBtn.style.display = 'none';
      }

      const cleanup = () => {
        if (options.closable === false) {
          return;
        }
        document.body.removeChild(container);
      };

      confirmBtn.addEventListener('click', () => {
        cleanup();
        resolve();
      });
    });
  }

  static openModal<T>({
    title,
    titleStyle,
    content,
  }: {
    title: string;
    titleStyle?: string;
    content: (resolve: (value: T) => void, close: () => void) => HTMLElement;
  }): Promise<T> {
    return new Promise((resolve) => {
      const modalContainer = document.createElement('div');
      modalContainer.innerHTML = this.template;
      document.body.appendChild(modalContainer);

      const btns = modalContainer.querySelector('.dialog-buttons') as HTMLElement;
      btns.style.display = 'none';

      this.injectStyles();

      const titleEl = modalContainer.querySelector('.dialog-title') as HTMLElement;

      if (title) {
        titleEl.textContent = title;
        if (titleStyle) {
          titleEl.style.cssText = titleStyle;
        }
      } else {
        titleEl.style.display = 'none';
      }

      const cleanup = () => {
        document.body.removeChild(modalContainer);
      };

      const close = () => {
        cleanup();
        resolve(null as T);
      };

      const messageEl = modalContainer.querySelector('.dialog-message') as HTMLElement;
      messageEl.appendChild(content(resolve, close));

      const overlay = modalContainer.querySelector('.dialog-overlay') as HTMLElement;
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          close();
        }
      });
    });
  }
}
