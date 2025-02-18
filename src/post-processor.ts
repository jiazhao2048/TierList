import { 
    App, 
    MarkdownPostProcessorContext,
    MarkdownRenderer,
    Component,
    Menu
} from 'obsidian';
import Sortable from 'sortablejs';
import {moveLinesInActiveFile, replaceLineInActiveFile, readLineFromActiveFile, deleteLineInActiveFile, insertLineInActiveFile} from 'file-utils';
import { SlotModal } from 'slot-modal';
import { DataviewSearchModal } from 'request-modal'
import { TierListSettings, setSetting } from 'settings';
import { getAPI } from "obsidian-dataview";

export function redraw(el: HTMLElement, settings: TierListSettings) {
    el.style.setProperty('--tier-list-width-ratio', `${settings.width / 100}`);
    el.style.setProperty('--screen-width', `${screen.width}px`);
    el.style.setProperty('--tier-list-slot-count', `${settings.slots}`);
    el.style.setProperty('--tier-list-aspect-ratio', `${settings.ratio}`);
}

function findDataLine(el: HTMLElement): number {
    let closestLineElement: HTMLElement | null = null;
    let farthestLineElement: HTMLElement | null = null;
    let current: HTMLElement | null = el;

    while (current) {
        if (current.hasAttribute("data-line")) {
            if (!closestLineElement) {
                closestLineElement = current;
            }
            farthestLineElement = current;
        }
        current = current.parentElement;
    }

    if (closestLineElement && farthestLineElement) {
        const closestValue = parseInt(closestLineElement.getAttribute("data-line") || "0", 10);
        const farthestValue = parseInt(farthestLineElement.getAttribute("data-line") || "0", 10);
        return closestLineElement === farthestLineElement ? closestValue : closestValue + farthestValue;
    }

    return 0;
}

export function generateTierListPostProcessor(app: App, settings: TierListSettings, component: Component): (tierList: HTMLElement, ctx: MarkdownPostProcessorContext) => void {

    return (tierList: HTMLElement, ctx: MarkdownPostProcessorContext) => {

        // Tier List Check
        const tagEl: HTMLElement = tierList.find(`a[href="${settings.tag}"]`);
        if (!tagEl) 
            return;
        tagEl.remove();

        const sectionInfo = ctx.getSectionInfo(tierList);
        if (!sectionInfo)
            return;

        const localSettings: TierListSettings = { ...settings };

        async function writeSetting(key: string, value: string) {
            const settingsList = tierList.find(".settings");
            const valueText = `\t- ${key}: ${value}`;
            if (settingsList) {
                for (const setting of settingsList.findAll('li')) {
                    const text = setting.textContent || '';
                    const [fileKey, fileValue] = text.split(':').map(item => item.trim());
                    if (fileKey.toLowerCase() == key.toLowerCase()) {
                        const settingLine = findDataLine(setting);
                        await replaceLineInActiveFile(app, settingLine, valueText);
                        return;
                    }
                }
                const settingLine = findDataLine(settingsList) + 1;
                await insertLineInActiveFile(app, settingLine, valueText);
            }
            else {
                // if (sectionInfo) {
                //     const line = sectionInfo.lineEnd || 0;
                //     await insertLineInActiveFile(app, line + 1, `- ${localSettings.settings}`);
                //     await insertLineInActiveFile(app, line + 2, valueText);
                // }
            }
        }

        async function renderSlot(slot: HTMLElement): Promise<HTMLElement> {
            slot.addClass("slot");
            // Check for internal-embed span and replace with img
            if (slot.find('a.internal-link') && !slot.find('a.internal-link').getAttribute('href')?.match(/\.(jpeg|jpg|gif|png|webp)$/i)) {
                const link = slot.find('a.internal-link');
                const filePath = link.getAttribute('href');
                if (filePath) {
                    const file = app.metadataCache.getFirstLinkpathDest(filePath, '');
                    if (file) {
                        const fileCache = app.metadataCache.getFileCache(file);
                        if (fileCache && fileCache.frontmatter && fileCache.frontmatter[settings.property]) {
                            let imageSrc = fileCache.frontmatter[settings.property];
                            if (imageSrc.match('http'))
                                imageSrc = `[](${imageSrc})`
                            slot.textContent = "";
                            await MarkdownRenderer.render(app, `!${imageSrc}`, slot, '', component);
                        }
                    }
                }
            }

            slot.addEventListener("contextmenu", async (evt) => {
                evt.preventDefault();
                evt.stopPropagation();
                const menu = new Menu();
                const line = findDataLine(slot);
                await addSlotContextMenuOptions(menu, line);
                menu.showAtPosition({ x: evt.clientX, y: evt.clientY });
            })
        
            addClickHandler(slot);
            addCursorChangeHandler(slot);
            return slot;
        }

        function addCursorChangeHandler(slot: HTMLElement) {
            slot.addEventListener('mouseover', (event: MouseEvent) => {
                if (event.ctrlKey) {
                    slot.classList.add('help-cursor');
                }
            });
        
            slot.addEventListener('mouseout', (event: MouseEvent) => {
                slot.classList.remove('help-cursor');
            });
        
            slot.addEventListener('mousemove', (event: MouseEvent) => {
                if (event.ctrlKey) {
                    slot.classList.add('help-cursor');
                } else {
                    slot.classList.remove('help-cursor');
                }
            });
        }

        function addClickHandler(slot: HTMLElement) {
            if (slot.find('.excalidraw-embedded-img'))
                return;
            slot.addEventListener('click', (event: MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();
                if (event.ctrlKey) {
                    const link = slot.find('a.internal-link, a.external-link');
                    if (link) {
                        const href = link.getAttribute('href');
                        if (href) {
                            if (link.hasClass('internal-link')) {
                                const file = app.metadataCache.getFirstLinkpathDest(href, '');
                                if (file) {
                                    app.workspace.openLinkText(href, file.path);
                                }
                            } else {
                                window.open(href, '_blank');
                            }
                        }
                    } else {
                        const img = slot.find('img');
                        if (img) {
                            const src = img.getAttribute('src');
                            if (src) {
                                window.open(src, '_blank');
                            }
                        }
                    }
                }
            });
            slot.addEventListener("dblclick", async (evt) => {
                evt.preventDefault();
                evt.stopPropagation();
                const line = findDataLine(slot);
                const str = await readLineFromActiveFile(app, line);
                new SlotModal(app, "Change slot", str || "0", async (result) => {
                    if (result != "")
                        await replaceLineInActiveFile(app, line, result);
                    else
                        await deleteLineInActiveFile(app, line);
                }).open();
            })
        }

        function addListContextMenuOptions(menu: Menu, line: number) {
            menu.addItem((item) => item.setTitle("Add slot").setIcon("square-plus").onClick(() => {
                new SlotModal(app, "Add slot", "\t", async (result) => {
                    if (result != "")
                        await insertLineInActiveFile(app, line, result);
                }).open();
            }));

            // Dataview request modal
            const dv = getAPI();
            if (dv) {
                menu.addItem((item) => item.setTitle("Request").setIcon("database").onClick(() => {
                    new DataviewSearchModal(app, localSettings.from, localSettings.where, async (names, from, where) => {
                        names = await filterTierListNames(names);
                        const text = names.map(name => `\t- [[${name}]]`).join("\n");

                        await writeSetting("Where", where);
                        await writeSetting("From", from);

                        if (text) {
                            await insertLineInActiveFile(app, line, text);   
                        }

                    }).open();
                }));
            }
        }

        async function addSlotContextMenuOptions(menu: Menu, line: number) {
            const str = await readLineFromActiveFile(app, line);
            menu.addItem((item) => item.setTitle("Edit slot").setIcon("pencil").onClick(() => {
                new SlotModal(app, "Change slot", str || "0", async (result) => {
                    if (result != "")
                        await replaceLineInActiveFile(app, line, result);
                    else
                        await deleteLineInActiveFile(app, line);
                }).open();
            }));
            menu.addItem((item) => {
                
                (item as any).dom.addClass("option-red");
                item.setTitle("Delete slot").setIcon("trash-2").onClick(async () => {
                    await deleteLineInActiveFile(app, line);
                })
            });
            addListContextMenuOptions(menu, line);
        }

        function initializeSlots() {
            // Initialize Sortable for all Slots elements
            tierList.findAll('ul > li > ul').forEach(list => {
                Sortable.create(list as HTMLElement, {
                    group: 'slot',
                    animation: settings.animation,
                    onEnd: async (evt) => {
                        const tierListLine = parseInt(evt.item.parentElement?.parentElement?.parentElement?.parentElement?.getAttr("data-line") || "0");
                        const parentLine = parseInt(evt.item.parentElement?.parentElement?.getAttr("data-line") || "0", 10);
                        const newIndex = evt.newIndex || 0;
                        const oldParentIndex = parseInt(evt.from.parentElement?.getAttr("data-line") || "0");
                        const oldIndex = evt.oldIndex || 0;

                        let newLine = tierListLine + parentLine + newIndex + 1;
                        let oldLine = tierListLine + oldParentIndex + oldIndex + 1;
                        if (oldLine < newLine && oldParentIndex == parentLine)
                            newLine = newLine + 1;

                        await moveLinesInActiveFile(app, oldLine, 1, newLine);
                    }
                });
                // Add Context Menu for lists
                list.addEventListener("contextmenu", async (evt) => {
                    evt.preventDefault();
                    const menu = new Menu();
                    const line = findDataLine(list) + list.children.length + 1;
                    addListContextMenuOptions(menu, line);
                    menu.showAtPosition({ x: evt.clientX, y: evt.clientY });
                })
                list.addEventListener("dblclick", (evt) => {
                    evt.preventDefault();
                    const line = findDataLine(list) + list.children.length + 1;
                    new SlotModal(app, "Add slot", "\t", async (result) => {
                        if (result != "")
                            await insertLineInActiveFile(app, line, result);
                    }).open();
                })
                list.findAll("li").forEach(list => {
                    renderSlot(list);
                })
            });
        }

        function initializeRows() {
            Sortable.create(tierList.find(":scope > ul"), {
                handle: '.tier',
                group: 'tier',
                animation: settings.animation,
                onEnd: async (evt) => {
                    if (evt.oldIndex == evt.newIndex)
                        return;

                    const tier = evt.item;
                    const tierLine = parseInt(tier.parentElement?.parentElement?.getAttr("data-line") || "0");
                    const oldLine = parseInt(tier.getAttr("data-line") || "0") + tierLine;
                    let newIndex = evt.newIndex || 0;
                    let oldIndex = evt.oldIndex || 0;
                    const ul = tier.parentElement;
                    const length = tier.find("ul").children.length + 1;

                    const oldChild = ul?.children[newIndex + (newIndex > oldIndex ? -1 : 1)];
                    
                    const oldChildLength = (oldChild?.find("ul")?.children.length || 0) + 1;
                    const oldChildLine = parseInt(oldChild?.getAttr("data-line") || "0");

                    let newLine = oldChildLine + tierLine;

                    if (newIndex >=  oldIndex) {
                        newLine = newLine + oldChildLength - length;
                    }

                    await moveLinesInActiveFile(app, oldLine, length, newLine, false);
                }
            });
        }

        function initializeTierSlots() {
            tierList.findAll(":scope > ul > li").forEach(li => {

                let text: string = "";
                let unordered: boolean = false;
                li.childNodes.forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        if (node.nodeValue?.contains(settings.settings)) {
                            settingsProcessing(li, localSettings);
                        }

                        else if (node.nodeValue?.contains(settings.unordered)) {
                            unordered = true;
                        }
                        else {
                            text = text + node.nodeValue;
                        }
                        node.remove();
                    }
                })
                
                if (!unordered) {
                    const innerList = li.find("ul");

                    const tierDiv = document.createElement("div");
                    tierDiv.addClass("tier");
                    tierDiv.textContent = text;

                    Array.from(li.childNodes).forEach(node => {
                        if (node != innerList) {
                            tierDiv.appendChild(node);
                        }
                    })

                    li.prepend(tierDiv);
                    renderSlot(tierDiv);
                }
                else {
                    li.find("ul").addClass("unordered");
                }
            })

        }

        function settingsProcessing(list: HTMLElement, settings: TierListSettings) {
            list.addClass("settings");
            const pairs: { [key: string]: string } = {};

            list.findAll('li').forEach(setting => {
                const text = setting.textContent || '';
                const [key, value] = text.split(':').map(item => item.trim());
                if (key && value) {
                    pairs[key] = value;
                }
            });

            for (const [key, value] of Object.entries(pairs)) {
                setSetting(key, value, settings);
            }
        }

        async function filterTierListNames(names: string[]): Promise<string[]> {
            if (!sectionInfo) return names;

            const activeFile = app.workspace.getActiveFile();
            if (!activeFile) return names;
            const fileContent = await app.vault.read(activeFile);
        
            const tierListLines = fileContent.split("\n").slice(sectionInfo.lineStart, sectionInfo.lineEnd + 1);
        
            function extractName(line: string): string | null {
                line = line.trim();
                if (!line.startsWith("- ")) return null;
                line = line.substring(2);
        
                line = line.replace(/<span[^>]*>(.*?)<\/span>/g, "$1");
        
                line = line.replace(/^!+/, "");
        
                const matchBracket = line.match(/^\[\[(.*?)(?:\s*\|\s*.*?)?\]\]/);
                if (matchBracket) return matchBracket[1];
                
                const matchParens = line.match(/^\[[^\]]*\]\((.*?)\)/);
                if (matchParens) return matchParens[1];
        
                return line;
            }
        
            const existingNames = new Set<string>();
            for (const line of tierListLines) {
                const name = extractName(line);
                if (name) existingNames.add(name);
            }
        
            return names.filter(name => !existingNames.has(name));
        }

        // HTML cleanup
        tierList.setAttr("data-line", sectionInfo.lineStart || 0);
        tierList.addClass("tier-list");   
        tierList.findAll(".list-bullet").forEach(span => span.remove());
        tierList.findAll(".list-collapse-indicator").forEach(span => span.remove());
        tierList.findAll(":scope > ul > li:not(:has(ul))").forEach(list => {
            const newul = document.createElement("ul");
            list.appendChild(newul);
        })

        initializeTierSlots();
        initializeSlots();
        initializeRows();

        redraw(tierList, localSettings);
    }
}
