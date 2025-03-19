import { MarkdownRenderer, Plugin } from 'obsidian';
import { TierListSettings } from 'settings';

export async function renderSlot(plugin: Plugin, settings: TierListSettings, slot: HTMLElement): Promise<HTMLElement> {
    const app = plugin.app;
    slot.addClass("tier-list-slot");
    
    // 函数用于添加点击跳转功能
    function addClickToJumpHandler(element: HTMLElement, filePath: string) {
        // 添加点击事件处理
        element.addEventListener('click', (e: MouseEvent) => {
            // 判断是否为图片上的点击
            if (e.target && (e.target as HTMLElement).tagName === 'IMG') {
                // 对于图片，我们阻止预览
                e.preventDefault();
                e.stopPropagation();
            }
            
            // 跳转到链接的文件
            const file = app.metadataCache.getFirstLinkpathDest(filePath, '');
            if (file) {
                // 使用history.pushState方式跳转，而不是新开页面
                app.workspace.openLinkText(filePath, file.path, false);
            }
        });
        
        // 添加帮助光标
        element.addEventListener('mouseover', () => {
            element.classList.add('file-link-cursor');
        });
        
        element.addEventListener('mouseout', () => {
            element.classList.remove('file-link-cursor');
        });
    }
    
    // 检查是否有data-cover-text属性的span
    const coverTextSpan = slot.querySelector('span[data-cover-text]') as HTMLElement | null;
    let coverText = null;
    
    if (coverTextSpan) {
        coverText = coverTextSpan.getAttribute('data-cover-text');
        // 从span中提取内部链接
        const link = coverTextSpan.querySelector('a.internal-link') as HTMLAnchorElement | null;
        if (link) {
            const filePath = link.getAttribute('href');
            if (filePath) {
                const file = app.metadataCache.getFirstLinkpathDest(filePath, '');
                if (file) {
                    const fileCache = app.metadataCache.getFileCache(file);
                    const parent = coverTextSpan;
                    if (fileCache && fileCache.frontmatter && fileCache.frontmatter[settings.image] && parent) {
                        let imageSrc = fileCache.frontmatter[settings.image];
                        if (imageSrc.match('http'))
                            imageSrc = `[](${imageSrc})`;
                        parent.textContent = '';
                        await MarkdownRenderer.render(app, `!${imageSrc}`, parent, '', plugin);
                        
                        // 阻止图片点击预览
                        const img = parent.querySelector('img');
                        if (img) {
                            img.classList.add('no-preview');
                        }
                        
                        slot.setAttr('href', filePath);
                        slot.setAttr('title', link.textContent);
                        
                        // 添加点击跳转功能
                        addClickToJumpHandler(slot, filePath);
                        
                        // 创建文本覆盖层
                        if (coverText) {
                            createTextOverlay(slot, coverText);
                        }
                    }
                }
            }
        }
    }
    
    // 标准内部链接处理
    const link = slot.find('a.internal-link');
    if (link && !link.getAttribute('href')?.match(/\.(jpeg|jpg|gif|png|webp)$/i)) {
        const filePath = link.getAttribute('href');
        if (filePath) {
            const file = app.metadataCache.getFirstLinkpathDest(filePath, '');
            if (file) {
                const fileCache = app.metadataCache.getFileCache(file);
                const parent = link.parentElement;
                if (fileCache && fileCache.frontmatter && fileCache.frontmatter[settings.image] && parent) {
                    let imageSrc = fileCache.frontmatter[settings.image];
                    if (imageSrc.match('http'))
                        imageSrc = `[](${imageSrc})`;
                    parent.textContent = '';
                    await MarkdownRenderer.render(app, `!${imageSrc}`, parent, '', plugin);
                    
                    // 阻止图片点击预览
                    const img = parent.querySelector('img');
                    if (img) {
                        img.classList.add('no-preview');
                    }
                    
                    slot.setAttr('href', filePath);
                    slot.setAttr('title', link.textContent);
                    
                    // 添加点击跳转功能
                    addClickToJumpHandler(slot, filePath);
                }
            }
        }
    }

    // Wait for the Exacalidraw render
    setTimeout(() => {
        slot.findAll(".excalidraw-embedded-img").forEach(excalidrawEl => {
            const newElement = excalidrawEl.cloneNode(true);
            excalidrawEl.parentElement?.replaceChild(newElement, excalidrawEl);
        })
    }, 50);

    const child = slot.find('[style*="background"]')
    if (child) {
        slot.style.backgroundColor = child.style.backgroundColor;
    }

    const fileEmbed = slot.find('.internal-embed.file-embed.mod-generic.is-loaded')
    if (fileEmbed) {
        const textNode = findTextNodeRecursive(fileEmbed);
        if (textNode) {
            textNode.nodeValue = fileEmbed.getAttr('alt');
        }
    }

    const altEl = slot.find('[alt]')
    if (altEl) {
        slot.setAttr('title', altEl.getAttr('alt'));
    }

    return slot;
}

/**
 * 创建文本覆盖层
 * @param parentElement 要添加文本覆盖层的父元素
 * @param text 要显示的文本
 */
function createTextOverlay(parentElement: HTMLElement, text: string) {
    // 检查是否已经存在文本覆盖层
    if (parentElement.find('.tier-list-text-overlay')) {
        return;
    }
    
    // 创建文本覆盖层
    const textOverlay = parentElement.createEl('div', {
        cls: 'tier-list-text-overlay',
        text: text
    });
    
    // 添加样式以确保文本可见性
    textOverlay.style.position = 'absolute';
    textOverlay.style.bottom = '0';
    textOverlay.style.left = '0';
    textOverlay.style.right = '0';
    textOverlay.style.padding = '4px';
    textOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
    textOverlay.style.color = 'white';
    textOverlay.style.textAlign = 'center';
    textOverlay.style.overflow = 'hidden';
    textOverlay.style.textOverflow = 'ellipsis';
    textOverlay.style.whiteSpace = 'nowrap';
    textOverlay.style.fontSize = '12px';
    textOverlay.style.fontWeight = 'bold';
    textOverlay.style.textShadow = '1px 1px 2px black';
}

function findTextNodeRecursive(element: HTMLElement): Text | null {
    const childNodesArray: ChildNode[] = Array.from(element.childNodes);

    for (const node of childNodesArray) {
        if (node.nodeType === Node.TEXT_NODE) {
            return node as Text;
        }
        if (node.nodeType === Node.ELEMENT_NODE) {
            const found = findTextNodeRecursive(node as HTMLElement);
            if (found) return found;
        }
    }
    return null;
}

