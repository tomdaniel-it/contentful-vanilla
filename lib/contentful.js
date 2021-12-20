(() => {
    if (!contentfulSpaceId || !contentfulCdaToken)
        throw new Error('Add the variables contentfulSpaceId & contentfulCdaToken before including the contentful library.');

    const graphApiUrl = `https://graphql.contentful.com/content/v1/spaces/${contentfulSpaceId}`;

    const CONTENTFUL_TYPE_TEXT = 'text';
    const CONTENTFUL_TYPE_MULTILINE_TEXT = 'text-multiline';
    const CONTENTFUL_TYPE_DATE = 'date';
    const CONTENTFUL_TYPE_IMAGE = 'image';
    const CONTENTFUL_TYPE_RICH_TEXT = 'rich-text';

    let generatedIdCounter = 0;

    const createContentfulProperties = (htmlElement) => {
        const propertyElements = [...htmlElement.querySelectorAll('[data-contentful-property]')];

        return propertyElements.map(el => {
            const propertyType = el.dataset.contentfulType;

            let property;
            switch (propertyType) {
                case CONTENTFUL_TYPE_TEXT:
                    property = new ContentfulTextProperty();
                    break;
                case CONTENTFUL_TYPE_MULTILINE_TEXT:
                    property = new ContentfulMultilineTextProperty();
                    break;
                case CONTENTFUL_TYPE_DATE:
                    property = new ContentfulDateProperty();
                    property.format = el.dataset.contentfulFormat || null;
                    break;
                case CONTENTFUL_TYPE_IMAGE:
                    property = new ContentfulImageProperty();
                    break;
                case CONTENTFUL_TYPE_RICH_TEXT:
                    property = new ContentfulRichTextProperty();
                    break;
                default:
                    throw new Error('Unknown data-contentful-type value for data-contentful-property element: ' + propertyType);
            }

            if (el.dataset.contentfulProperty == null) throw new Error('data-contentful-property attribute requires a value.');
            property.name = el.dataset.contentfulProperty;

            return property;
        });
    };

    const createContentfulList = (htmlElement) => {
        if (htmlElement.children.length !== 1) {
            throw new Error('data-contentful-list element must have exactly one child element which defines template element.');
        }

        const list = new ContentfulList();
        if (htmlElement.dataset.contentfulList == null) throw new Error('data-contentful-list attribute must have a value containing the name of the element.');
        list.name = htmlElement.dataset.contentfulList;
        list.element = htmlElement;
        list.templateElement = htmlElement.children[0];
        list.properties = createContentfulProperties(list.templateElement);

        list.templateElement.remove();

        return list;
    };

    const createContentfulContent = (htmlElement) => {
        const content = new ContentfulContent();
        if (htmlElement.dataset.contentfulContent == null) throw new Error('data-contentful-content attribute must have a value containing the name of the element.');
        content.name = htmlElement.dataset.contentfulContent;
        content.element = htmlElement;
        if (htmlElement.dataset.contentfulId == null) throw new Error('data-contentful-content requires the data-contentful-id attribute.');
        content.id = htmlElement.dataset.contentfulId;
        content.properties = createContentfulProperties(content.element);

        return content;
    };

    const fetchContentfulPropertyValues = async (elements) => {
        const queryParts = elements.map(element => {
            if (element instanceof ContentfulList) {
                return `${element.name}Collection{items{sys{id},${element.properties.map(prop => prop.toGraphQLQuery()).join(',')}}}`;
            } else if (element instanceof ContentfulContent) {
                return `${element.generatedId}:${element.name}(id:"${element.id}"){${element.properties.map(prop => prop.toGraphQLQuery()).join(',')}}`;
            } else {
                throw new Error('Unknown root contentful element: ' + element.constructor.name);
            }
        });
        const graphQLQuery = `{${queryParts}}`;
        const response = await fetch(graphApiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${contentfulCdaToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: graphQLQuery })
        });
        if (!response.ok) {
            throw new Error(await response.text());
        }
        const responseObj = await response.json();

        const createPropertyWithContentfulData = (property, contentfulData) => {
            const newProperty = property.clone();
            if (newProperty instanceof ContentfulTextProperty) {
                newProperty.text = contentfulData[newProperty.name];
            } else if (newProperty instanceof ContentfulMultilineTextProperty) {
                newProperty.text = contentfulData[newProperty.name];
            } else if (newProperty instanceof ContentfulDateProperty) {
                newProperty.date = contentfulData[newProperty.name];
            } else if (newProperty instanceof ContentfulRichTextProperty) {
                newProperty.content = contentfulData[newProperty.name].json.content;
                let manipulateListItem;
                manipulateListItem = (contentItem => {
                    if (contentItem.nodeType === 'list-item') {
                        contentItem.content.forEach(subContentItem => {
                            if (subContentItem.nodeType === 'paragraph') subContentItem.nodeType = 'list-item-paragraph';
                        })
                    } else if (contentItem.content instanceof Array) {
                        contentItem.content.forEach(manipulateListItem);
                    }
                });
                newProperty.content.forEach(manipulateListItem);
                newProperty.hyperlinkAssets = contentfulData[newProperty.name].links.assets.hyperlink || [];
                newProperty.blockAssets = contentfulData[newProperty.name].links.assets.block || [];
            } else if (newProperty instanceof ContentfulImageProperty) {
                newProperty.title = contentfulData[newProperty.name].title;
                newProperty.url = contentfulData[newProperty.name].url;
            } else {
                throw new Error('Unknown property type: ' + property.constructor.name);
            }

            return newProperty;
        };

        return elements.map(element => {
            if (element instanceof ContentfulList) {
                element.values = responseObj.data[`${element.name}Collection`].items.map(item => {
                    const content = new ContentfulContent();
                    content.id = item.sys.id;
                    content.name = element.name;
                    content.properties = element.properties.map(property => createPropertyWithContentfulData(property, item));

                    return content;
                });

                return element;
            } else if (element instanceof ContentfulContent) {
                const elementData = responseObj.data[element.generatedId];
                element.properties = element.properties.map(property => createPropertyWithContentfulData(property, elementData));
                return element;
            } else {
                throw new Error('Unknown root contentful element: ' + element.constructor.name);
            }
        });
    };

    const sanitizeHTML = (str) => str.replace(/[^\w. ]/gi, (c) => '&#' + c.charCodeAt(0) + ';');

    const richTextTemplateNodeTypes = ['heading-1', 'heading-2', 'heading-3', 'heading-4', 'heading-5', 'heading-6', 'paragraph',
        'list-item-paragraph', 'hyperlink', 'asset-hyperlink', 'entry-hyperlink', 'blockquote', 'hr', 'embedded-asset-block'];
    const richTextTemplateNodesWithChildTemplates = ['ordered-list', 'unordered-list'];

    const generateRichHtmlNodes = (property, propertyEl) => {
        if (!(property instanceof ContentfulRichTextProperty)) {
            throw new Error('Can not generate rich HTML for non rich-text property.');
        }

        const templates = {};
        [...propertyEl.querySelectorAll(`[data-contentful-rich-link]`)]
            .filter(el => el.parentElement === propertyEl)
            .forEach(templateEl => {
                const nodeType = templateEl.dataset.contentfulRichLink;
                if (templates[nodeType] != null) {
                    console.warn('Multiple rich text templates found for rich text type: ' + nodeType);
                }
                if (!richTextTemplateNodeTypes.includes(nodeType) && !richTextTemplateNodesWithChildTemplates.includes(nodeType)) {
                    console.warn('Rich text type ' + nodeType + ' not supported, ignoring.');
                    return;
                }
                const template = {
                    element: templateEl,
                    valueElement: templateEl.querySelector(`[data-contentful-rich-value]`) || templateEl
                };
                if (richTextTemplateNodesWithChildTemplates.includes(nodeType)) {
                    const childTemplateEl = templateEl.querySelector(`[data-contentful-rich-link="child-item"]`);
                    if (childTemplateEl == null) {
                        console.warn(`Expected rich text type ${nodeType} to have a template element with data-contentful-rich-link="child-item" attribute. Ignoring this template.`);
                        return;
                    }

                    template.childTemplate = {
                        element: childTemplateEl,
                        valueElement: childTemplateEl.querySelector(`[data-contentful-rich-value]`) || childTemplateEl
                    };
                }
                templates[nodeType] = template;
            });

        const generateBasicContentHtml = (contentItem) => {
            let valueStr = contentItem.value.replace(/\n/g, '<br>');
            if (contentItem.marks instanceof Array) contentItem.marks.forEach(mark => {
                switch (mark.type) {
                    case 'bold':
                        valueStr = `<b>${valueStr}</b>`;
                        break;
                    case 'italic':
                        valueStr = `<i>${valueStr}</i>`;
                        break;
                    case 'underline':
                        valueStr = `<u>${valueStr}</u>`;
                        break;
                    case 'code':
                        valueStr = `<code>${valueStr}</code>`;
                        break;
                    default:
                        console.warn(`Unknown rich content mark type: ${mark.type}. Ignoring this mark type.`);
                }
            });
            return `<span>${valueStr}</span>`;
        };

        let createContentItemNode;
        createContentItemNode = (contentItem) => {
            const template = templates[contentItem.nodeType];
            if (!template) {
                console.warn(`Template for nodeType ${contentItem.nodeType} not found, ignoring this content.`);
                return null;
            }
            switch (contentItem.nodeType) {
                case 'heading-1':
                case 'heading-2':
                case 'heading-3':
                case 'heading-4':
                case 'heading-5':
                case 'heading-6':
                case 'paragraph':
                case 'list-item-paragraph':
                case 'blockquote':
                    template.valueElement.innerHTML = contentItem.content.map(subContentItem => {
                        if (subContentItem.content instanceof Array) {
                            const subTemplate = templates[subContentItem.nodeType];
                            switch (subContentItem.nodeType) {
                                case 'hyperlink':
                                    subTemplate.valueElement.href = subContentItem.data.uri;
                                    subTemplate.valueElement.innerHTML = subContentItem.content.map(subSubContentItem => {
                                        return generateBasicContentHtml(subSubContentItem);
                                    }).join('');
                                    return subTemplate.element.outerHTML;
                                case 'asset-hyperlink':
                                    const asset = property.hyperlinkAssets.find(asset => asset.sys.id === subContentItem.data.target.sys.id);
                                    subTemplate.valueElement.href = asset.url;
                                    subTemplate.valueElement.innerHTML = subContentItem.content.map(subSubContentItem => {
                                        return generateBasicContentHtml(subSubContentItem);
                                    }).join('');
                                    return subTemplate.element.outerHTML;
                                case 'entry-hyperlink':
                                    subTemplate.valueElement.href = subTemplate.element.dataset.contentfulRichEmbedHyperlinkUrl
                                        .replace('{{ID}}', subContentItem.data.target.sys.id);
                                    subTemplate.valueElement.innerHTML = subContentItem.content.map(subSubContentItem => {
                                        return generateBasicContentHtml(subSubContentItem);
                                    }).join('');
                                    return subTemplate.element.outerHTML;
                                case 'paragraph':
                                    return createContentItemNode(subContentItem).outerHTML;
                                default:
                                    console.log(contentItem)
                                    console.warn(`Unknown sub-node type: ${subContentItem.nodeType}. Ignoring this content.`);
                                    return '';
                            }
                        }
                        return generateBasicContentHtml(subContentItem);
                    }).join('');
                    return template.element.cloneNode(true);
                case 'hr':
                    return template.element.cloneNode(true);
                case 'embedded-asset-block':
                    const asset = property.blockAssets.find(asset => asset.sys.id === contentItem.data.target.sys.id);
                    if (asset == null) throw new Error('Could not find asset linked from contentful content item.');
                    template.valueElement.src = asset.url;
                    template.valueElement.alt = asset.title;
                    return template.element.cloneNode(true);
                case 'ordered-list':
                case 'unordered-list':
                    const mainElement = template.element.cloneNode(true);
                    const valueElement = [...mainElement.querySelectorAll(`[data-contentful-rich-value]`)]
                        .find(el => el.querySelector(`[data-contentful-rich-link="child-item"]`) != null) || mainElement;
                    const childElementTemplate = mainElement.querySelector(`[data-contentful-rich-link="child-item"]`);
                    [...valueElement.childNodes].forEach(node => node.remove());
                    const childNodes = contentItem.content.map(subContentItem => {
                        const childElement = childElementTemplate.cloneNode(true);
                        const childValueElement = childElement.querySelector(`[data-contentful-rich-value]`) || childElement;
                        const childContainerNodes = subContentItem.content.map(createContentItemNode);
                        childContainerNodes.forEach(node => node && childValueElement.appendChild(node));
                        return childElement;
                    });
                    [...childNodes].forEach(node => valueElement.appendChild(node));
                    return mainElement;
                default:
                    console.warn(`Unknown node type: ${contentItem.nodeType}. Ignoring this content.`);
                    return null;
            }
        };
        return property.content.map(createContentItemNode).filter(el => el);
    };

    const updateDOMForContentfulContent = (content) => {
        if (!(content instanceof ContentfulContent)) {
            throw new Error('Content to update DOM to was not of type ContentfulContent, but class: ' + content.constructor.name);
        }

        content.properties.forEach(property => {
            const elements = [...content.element.querySelectorAll(`[data-contentful-property="${property.name}"]`)];

            let updateElement;
            if (property instanceof ContentfulTextProperty) {
                updateElement = (el => el.innerHTML = sanitizeHTML(property.text.replace(/\n/g, '')));
            } else if (property instanceof ContentfulMultilineTextProperty) {
                updateElement = (el => el.innerHTML = property.text.split('\n').map(str => sanitizeHTML(str)).join('<br>'))
            } else if (property instanceof ContentfulDateProperty) {
                updateElement = (el => el.innerHTML = dayjs(property.date).format(property.format));
            } else if (property instanceof ContentfulRichTextProperty) {
                updateElement = (el => {
                    el.childNodes.forEach(node => node.remove());
                    const nodes = generateRichHtmlNodes(property, el);
                    [...el.childNodes].forEach(node => node.remove());
                    nodes.forEach(node => el.appendChild(node));
                });
            } else if (property instanceof ContentfulImageProperty) {
                updateElement = (el => {
                    el.src = property.url;
                    el.alt = property.title;
                });
            } else {
                throw new Error('Unknown property type: ' + property.constructor.name);
            }

            elements.forEach(updateElement);
        });
    };

    const updateDOMForContentfulElement = (contentfulElement) => {
        if (contentfulElement instanceof ContentfulList) {
            contentfulElement.values.forEach(value => {
                value.element = contentfulElement.templateElement.cloneNode(true);
                value.element.dataset.contentfulContent = contentfulElement.name;
                value.element.dataset.contentfulId = value.id;

                contentfulElement.element.append(value.element);
                updateDOMForContentfulContent(value);
            });
        } else if (contentfulElement instanceof ContentfulContent) {
            updateDOMForContentfulContent(contentfulElement);
        } else {
            throw new Error('Unsupported element type: ' + contentfulElement.constructor.name);
        }
    };

    const loadContentfulContent = async () => {
        const listElements = [...document.querySelectorAll('[data-contentful-list]')];
        const contentElements = [...document.querySelectorAll('[data-contentful-content]')];

        const lists = listElements.map(createContentfulList);
        const contents = contentElements.map(createContentfulContent);

        const elements = await fetchContentfulPropertyValues([...lists, ...contents]);

        elements.forEach(updateDOMForContentfulElement);
    };

    window.addEventListener('DOMContentLoaded', loadContentfulContent);

    class ContentfulElement {
        name;
        element;
        properties;
    }

    class ContentfulList extends ContentfulElement {
        templateElement;
        values;
    }

    class ContentfulContent extends ContentfulElement {
        id;
        generatedId;

        constructor() {
            super();
            this.generatedId = `obj${generatedIdCounter++}`;
        }
    }

    class ContentfulProperty {
        name;

        clone() {
            throw new Error('Inheriting class of ContentfulProperty does not implement clone() function.');
        }
    }

    class ContentfulTextProperty extends ContentfulProperty {
        text;

        toGraphQLQuery() {
            return this.name;
        }

        clone() {
            const newProperty = new ContentfulTextProperty();
            newProperty.name = this.name;
            newProperty.text = this.text;
            return newProperty;
        }
    }

    class ContentfulMultilineTextProperty extends ContentfulProperty {
        text;

        toGraphQLQuery() {
            return this.name;
        }

        clone() {
            const newProperty = new ContentfulMultilineTextProperty();
            newProperty.name = this.name;
            newProperty.text = this.text;
            return newProperty;
        }
    }

    class ContentfulDateProperty extends ContentfulProperty {
        date;
        format;

        toGraphQLQuery() {
            return this.name;
        }

        clone() {
            const newProperty = new ContentfulDateProperty();
            newProperty.name = this.name;
            newProperty.date = this.date;
            newProperty.format = this.format;
            return newProperty;
        }
    }

    class ContentfulRichTextProperty extends ContentfulProperty {
        content;
        hyperlinkAssets;
        blockAssets;

        toGraphQLQuery() {
            return `${this.name}{json,links{assets{hyperlink{sys{id},url},block{sys{id},title,url}}}}`;
        }

        clone() {
            const newProperty = new ContentfulRichTextProperty();
            newProperty.name = this.name;
            newProperty.content = this.content;
            newProperty.hyperlinkAssets = this.hyperlinkAssets;
            newProperty.blockAssets = this.blockAssets;
            return newProperty;
        }
    }

    class ContentfulImageProperty extends ContentfulProperty {
        title;
        url;

        toGraphQLQuery() {
            return `${this.name}{title,url}`;
        }

        clone() {
            const newProperty = new ContentfulImageProperty();
            newProperty.name = this.name;
            newProperty.title = this.title;
            newProperty.url = this.url;
            return newProperty;
        }
    }
})();
