'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vscode = require('vscode');

const DEFAULT_WORD_SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?';
const SUPPORTED_LANGUAGES = new Set(['latex', 'tex', 'doctex']);

let snippetCache = [];
let snippetCacheKey = '';
let warnedAboutParseFailure = false;

function userSnippetCandidates() {
    const home = os.homedir();

    if (process.platform === 'darwin') {
        return [
            path.join(home, 'Library', 'Application Support', 'Code', 'User', 'snippets', 'latex.json'),
            path.join(home, 'Library', 'Application Support', 'Code - Insiders', 'User', 'snippets', 'latex.json')
        ];
    }

    if (process.platform === 'win32') {
        const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
        return [
            path.join(appData, 'Code', 'User', 'snippets', 'latex.json'),
            path.join(appData, 'Code - Insiders', 'User', 'snippets', 'latex.json')
        ];
    }

    const configHome = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    return [
        path.join(configHome, 'Code', 'User', 'snippets', 'latex.json'),
        path.join(configHome, 'Code - OSS', 'User', 'snippets', 'latex.json'),
        path.join(configHome, 'Code - Insiders', 'User', 'snippets', 'latex.json')
    ];
}

function stripJsonComments(source) {
    let result = '';
    let inString = false;
    let escaped = false;
    let lineComment = false;
    let blockComment = false;

    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        const next = source[index + 1];

        if (lineComment) {
            if (char === '\n' || char === '\r') {
                lineComment = false;
                result += char;
            } else {
                result += ' ';
            }
            continue;
        }

        if (blockComment) {
            if (char === '*' && next === '/') {
                result += '  ';
                index += 1;
                blockComment = false;
            } else {
                result += char === '\n' || char === '\r' ? char : ' ';
            }
            continue;
        }

        if (!inString && char === '/' && next === '/') {
            result += '  ';
            index += 1;
            lineComment = true;
            continue;
        }

        if (!inString && char === '/' && next === '*') {
            result += '  ';
            index += 1;
            blockComment = true;
            continue;
        }

        result += char;

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
        } else if (char === '"') {
            inString = true;
        }
    }

    return result;
}

function stripTrailingCommas(source) {
    let result = '';
    let inString = false;
    let escaped = false;

    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];

        if (!inString && char === ',') {
            let lookahead = index + 1;
            while (lookahead < source.length && /\s/u.test(source[lookahead])) {
                lookahead += 1;
            }

            if (source[lookahead] === '}' || source[lookahead] === ']') {
                continue;
            }
        }

        result += char;

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
        } else if (char === '"') {
            inString = true;
        }
    }

    return result;
}

function normalizeSnippets(rawSnippets) {
    const normalized = [];

    for (const [name, definition] of Object.entries(rawSnippets)) {
        if (!definition || definition.prefix === undefined || definition.body === undefined) {
            continue;
        }

        const prefixes = Array.isArray(definition.prefix) ? definition.prefix : [definition.prefix];
        const body = Array.isArray(definition.body) ? definition.body.join('\n') : definition.body;

        if (typeof body !== 'string') {
            continue;
        }

        for (const prefix of prefixes) {
            if (typeof prefix === 'string' && prefix.length > 0) {
                normalized.push({
                    name,
                    prefix,
                    body,
                    description: definition.description || ''
                });
            }
        }
    }

    return normalized.sort((left, right) => right.prefix.length - left.prefix.length);
}

function loadSnippets(force = false) {
    const snippetPath = userSnippetCandidates().find(candidate => fs.existsSync(candidate));
    if (!snippetPath) {
        snippetCache = [];
        snippetCacheKey = '';
        return snippetCache;
    }

    try {
        const stat = fs.statSync(snippetPath);
        const cacheKey = `${snippetPath}:${stat.mtimeMs}:${stat.size}`;
        if (!force && cacheKey === snippetCacheKey) {
            return snippetCache;
        }

        const source = fs.readFileSync(snippetPath, 'utf8');
        const json = stripTrailingCommas(stripJsonComments(source));
        snippetCache = normalizeSnippets(JSON.parse(json));
        snippetCacheKey = cacheKey;
        warnedAboutParseFailure = false;
    } catch (error) {
        snippetCache = [];
        snippetCacheKey = '';

        if (!warnedAboutParseFailure) {
            warnedAboutParseFailure = true;
            vscode.window.showWarningMessage(`LaTeX postfix snippets could not read latex.json: ${error.message}`);
        }
    }

    return snippetCache;
}

function previousCodePoint(text) {
    const characters = Array.from(text);
    return characters.length === 0 ? '' : characters[characters.length - 1];
}

function nativeWordBoundaryExists(document, suffixStart) {
    if (suffixStart.character <= 0) {
        return true;
    }

    const precedingText = document.lineAt(suffixStart.line).text.slice(0, suffixStart.character);
    const precedingCharacter = previousCodePoint(precedingText);
    if (!precedingCharacter || /\s/u.test(precedingCharacter)) {
        return true;
    }

    const separators = vscode.workspace
        .getConfiguration('editor', document.uri)
        .get('wordSeparators', DEFAULT_WORD_SEPARATORS);

    return separators.includes(precedingCharacter);
}

function provideCompletionItems(document, position) {
    if (!SUPPORTED_LANGUAGES.has(document.languageId)) {
        return [];
    }

    const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
    const matches = loadSnippets().filter(snippet => linePrefix.endsWith(snippet.prefix));
    if (matches.length === 0) {
        return [];
    }

    const longestMatchStart = position.translate(0, -matches[0].prefix.length);
    if (nativeWordBoundaryExists(document, longestMatchStart)) {
        return [];
    }

    const items = [];
    for (const snippet of matches) {
        const start = position.translate(0, -snippet.prefix.length);

        // Native snippets already work at the start of a word. Supply a completion
        // only when adjacent text has made the trigger part of a longer word.
        if (nativeWordBoundaryExists(document, start)) {
            continue;
        }

        const item = new vscode.CompletionItem(snippet.prefix, vscode.CompletionItemKind.Snippet);
        item.detail = `${snippet.name} · postfix snippet`;
        item.documentation = snippet.description;
        item.filterText = snippet.prefix;
        item.insertText = new vscode.SnippetString(snippet.body);
        item.range = new vscode.Range(start, position);
        item.sortText = `0${String(999 - snippet.prefix.length).padStart(3, '0')}`;
        items.push(item);
    }

    if (items.length > 0) {
        items[0].preselect = true;
    }

    return items;
}

function activate(context) {
    const snippets = loadSnippets(true);

    const selector = [...SUPPORTED_LANGUAGES].map(language => ({ language }));
    const triggerCharacters = [...new Set(snippets.map(snippet => snippet.prefix.at(-1)))];
    const provider = vscode.languages.registerCompletionItemProvider(selector, {
        provideCompletionItems
    }, ...triggerCharacters);

    const reloadCommand = vscode.commands.registerCommand('latexPostfixSnippets.reload', () => {
        const count = loadSnippets(true).length;
        vscode.window.showInformationMessage(`Reloaded ${count} LaTeX postfix snippet triggers.`);
    });

    context.subscriptions.push(provider, reloadCommand);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
