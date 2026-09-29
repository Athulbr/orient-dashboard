import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';

export type FileNode = {
    name: string;
    path: string;
    type: 'file' | 'folder';
    children?: FileNode[];
};

export type SelectedFile = {
    path: string;
    content: string;
};

const getPathFromSrc = (fullPath: string) => {
    const index = fullPath.indexOf('/src/');
    return index !== -1 ? fullPath.slice(index + 1) : fullPath;
};

const API = 'http://localhost:4000';

export default function CodeEditor() {
    const [tree, setTree] = useState<FileNode[]>([]);
    const [content, setContent] = useState('');
    const [activeFile, setActiveFile] = useState('');
    const [explorerWidth, setExplorerWidth] = useState(400);
    const [selectionWidth, setSelectionWidth] = useState(300);
    const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
    const [totalContentLength, setTotalContentLength] = useState(300);

    useEffect(() => {
        setTotalContentLength(() => {
            return selectedFiles.reduce((acc, file) => acc + file.content.length, 0);
        });
    }, [selectedFiles.length]);

    useEffect(() => {
        fetch(`${API}/tree`)
            .then(res => res.json())
            .then(setTree);
    }, []);

    const handleExplorerResize = (e: React.MouseEvent) => {
        e.preventDefault();

        const handleMouseMove = (e: MouseEvent) => {
            const newWidth = Math.max(200, Math.min(e.clientX, 800));
            setExplorerWidth(newWidth);
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleSelectionResize = (e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = selectionWidth;

        const handleMouseMove = (e: MouseEvent) => {
            const delta = e.clientX - startX;
            const newWidth = Math.max(200, Math.min(startWidth + delta, 800));
            setSelectionWidth(newWidth);
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const openFile = async (path: string) => {
        setActiveFile(path);
        const res = await fetch(`${API}/get-file?path=${encodeURIComponent(path)}`);
        const data = await res.json();
        setContent(data.content);
    };

    const getAllFilePaths = (node: FileNode): string[] => {
        if (node.type === 'file') return [node.path];
        return node.children?.flatMap(getAllFilePaths) || [];
    };

    const fetchFileContent = async (path: string): Promise<SelectedFile> => {
        try {
            const res = await fetch(`${API}/get-file?path=${encodeURIComponent(path)}`);
            const data = await res.json();
            return {
                path: path,
                content: data.content
            };
        } catch (error) {
            console.error(`Failed to fetch file: ${path}`, error);
            return {
                path: path,
                content: ''
            };
        }
    };

    const toggleFileSelection = async (path: string) => {
        const existingFile = selectedFiles.find(f => f.path === path);

        if (existingFile) {
            setSelectedFiles(prev => prev.filter(f => f.path !== path));
        } else {
            const fileData = await fetchFileContent(path);
            setSelectedFiles(prev => [...prev, fileData]);
        }
    };

    const toggleFolderSelection = async (node: FileNode) => {
        const allPaths = getAllFilePaths(node);
        const selectedPaths = selectedFiles.map(f => f.path);
        const allSelected = allPaths.every(p => selectedPaths.includes(p));

        if (allSelected) {
            setSelectedFiles(prev => prev.filter(f => !allPaths.includes(f.path)));
        } else {
            const newPaths = allPaths.filter(p => !selectedPaths.includes(p));
            const newFiles = await Promise.all(newPaths.map(fetchFileContent));
            setSelectedFiles(prev => [...prev, ...newFiles]);
        }
    };

    const exportSelectedFiles = async () => {
        if (!selectedFiles.length) return;
        try {
            const output = selectedFiles
                .filter(f => f.content)
                .map(f => `// ===== FILE: ${getPathFromSrc(f.path)} =====\n${f.content}\n`)
                .join('\n');

            const selectedFilesWithPrompt =
                output +
                `
\n\n
// ===== LLM Prompt =====

Must return only parsable and valid JSON.
output must be in this format:
[{
    "path":"User/.../file_name",
    "content":"file_content"
},
{
    "path":"User/.../file_name",
    "content":"file_content"
}]`;

            await navigator.clipboard.writeText(output);
            console.log('Files copied to clipboard');
        } catch (err) {
            console.error('Failed to export files', err);
        }
    };

    const selectedPaths = selectedFiles.map(f => f.path);

    return (
        <div className="h-screen flex bg-[#1e1e1e] text-[#cccccc] font-mono">
            <Explorer
                tree={tree}
                onFileClick={openFile}
                activeFile={activeFile}
                width={explorerWidth}
                selectedFilePaths={selectedPaths}
                onToggleFile={toggleFileSelection}
                onToggleFolder={toggleFolderSelection}
            />
            <div className="w-1 bg-[#333] hover:bg-[#007acc] cursor-col-resize transition-colors" onMouseDown={handleExplorerResize} />

            <SelectionPanel
                onFileClick={openFile}
                selectedFiles={selectedFiles}
                onRemove={toggleFileSelection}
                onClearAll={() => setSelectedFiles([])}
                width={selectionWidth}
                exportSelectedFiles={exportSelectedFiles}
                totalContentLength={totalContentLength}
            />
            <div className="w-1 bg-[#333] hover:bg-[#007acc] cursor-col-resize transition-colors" onMouseDown={handleSelectionResize} />

            <MonacoEditor content={content} file={activeFile} />
        </div>
    );
}

const Explorer = ({
    tree,
    onFileClick,
    activeFile,
    width,
    selectedFilePaths,
    onToggleFile,
    onToggleFolder
}: {
    tree: FileNode[];
    onFileClick: (path: string) => void;
    activeFile: string;
    width: number;
    selectedFilePaths: string[];
    onToggleFile: (path: string) => void;
    onToggleFolder: (node: FileNode) => void;
}) => (
    <div className="bg-[#252526] border-r border-[#333] overflow-auto" style={{ width: `${width}px` }}>
        <div className="px-3 py-2 text-xs text-[#bbbbbb] font-semibold">EXPLORER</div>
        <FileTree
            nodes={tree}
            onFileClick={onFileClick}
            activeFile={activeFile}
            selectedFilePaths={selectedFilePaths}
            onToggleFile={onToggleFile}
            onToggleFolder={onToggleFolder}
        />
    </div>
);

const SelectionPanel = ({
    selectedFiles,
    onFileClick,
    onRemove,
    onClearAll,
    width,
    exportSelectedFiles,
    totalContentLength
}: {
    selectedFiles: SelectedFile[];
    onFileClick: (path: string) => void;
    onRemove: (path: string) => void;
    onClearAll: () => void;
    width: number;
    exportSelectedFiles: () => void;
    totalContentLength: number;
}) => {
    return (
        <div className="bg-[#252526] border-r border-[#333] overflow-auto flex flex-col" style={{ width: `${width}px` }}>
            <div className="px-3 py-2 text-xs text-[#bbbbbb] font-semibold flex justify-between items-center border-b border-[#333]">
                <span>
                    SELECTED FILES ({selectedFiles.length}) ({totalContentLength} characters)
                </span>
                {selectedFiles.length > 0 && (
                    <div className="flex gap-4">
                        <button onClick={onClearAll} className="text-xs cursor-pointer text-[#007acc] hover:text-[#0098ff] font-normal">
                            Clear All
                        </button>
                        <button onClick={exportSelectedFiles} className="text-xs cursor-pointer text-[#007acc] hover:text-[#0098ff] font-normal">
                            Export
                        </button>
                    </div>
                )}
            </div>
            <div className="flex-1 overflow-auto">
                {selectedFiles.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-[#888]">No files selected</div>
                ) : (
                    <div className="p-2">
                        {selectedFiles.map(file => (
                            <div key={file.path} className="text-xs py-1 px-2 hover:bg-[#2a2d2e] rounded flex justify-between items-center group mb-1">
                                <span className="truncate flex-1 cursor-pointer" onClick={() => onFileClick(file.path)}>
                                    {getPathFromSrc(file.path)} ({file.content.length})
                                </span>
                                <button
                                    onClick={() => onRemove(file.path)}
                                    className="ml-2 text-[#888] hover:text-[#f44] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const FileTree = ({
    nodes,
    level = 0,
    onFileClick,
    activeFile,
    selectedFilePaths,
    onToggleFile,
    onToggleFolder
}: {
    nodes: FileNode[];
    level?: number;
    onFileClick: (path: string) => void;
    activeFile: string;
    selectedFilePaths: string[];
    onToggleFile: (path: string) => void;
    onToggleFolder: (node: FileNode) => void;
}) => (
    <div className="p-4">
        {nodes.map(node =>
            node.type === 'folder' ? (
                <FolderNode
                    key={node.path}
                    node={node}
                    level={level}
                    onFileClick={onFileClick}
                    activeFile={activeFile}
                    selectedFilePaths={selectedFilePaths}
                    onToggleFile={onToggleFile}
                    onToggleFolder={onToggleFolder}
                />
            ) : (
                <FileNodeItem
                    key={node.path}
                    node={node}
                    level={level}
                    onFileClick={onFileClick}
                    activeFile={activeFile}
                    selectedFilePaths={selectedFilePaths}
                    onToggleFile={onToggleFile}
                />
            )
        )}
    </div>
);

const FolderNode = ({
    node,
    level,
    onFileClick,
    activeFile,
    selectedFilePaths,
    onToggleFile,
    onToggleFolder
}: {
    node: FileNode;
    level: number;
    onFileClick: (path: string) => void;
    activeFile: string;
    selectedFilePaths: string[];
    onToggleFile: (path: string) => void;
    onToggleFolder: (node: FileNode) => void;
}) => {
    const [open, setOpen] = useState(false);

    const getAllFilePaths = (n: FileNode): string[] => {
        if (n.type === 'file') return [n.path];
        return n.children?.flatMap(getAllFilePaths) || [];
    };

    const allPaths = getAllFilePaths(node);
    const isChecked = allPaths.length > 0 && allPaths.every(p => selectedFilePaths.includes(p));
    const isIndeterminate = !isChecked && allPaths.some(p => selectedFilePaths.includes(p));

    return (
        <div>
            <div className="flex items-center cursor-pointer select-none hover:bg-[#2a2d2e]" style={{ paddingLeft: level * 14 }}>
                <input
                    type="checkbox"
                    checked={isChecked}
                    // @ts-ignore
                    ref={el => el && (el.indeterminate = isIndeterminate)}
                    onChange={e => {
                        e.stopPropagation();
                        onToggleFolder(node);
                    }}
                    onClick={e => e.stopPropagation()}
                    className="mr-2 cursor-pointer"
                />
                <div onClick={() => setOpen(!open)} className="flex items-center flex-1">
                    <span className="w-4 text-xs">{open ? '▼' : '▶'}</span>
                    <span className="text-[#c5c5c5] py-0.5">{node.name}</span>
                </div>
            </div>

            {open && node.children && (
                <FileTree
                    nodes={node.children}
                    level={level + 1}
                    onFileClick={onFileClick}
                    activeFile={activeFile}
                    selectedFilePaths={selectedFilePaths}
                    onToggleFile={onToggleFile}
                    onToggleFolder={onToggleFolder}
                />
            )}
        </div>
    );
};

const FileNodeItem = ({
    node,
    level,
    onFileClick,
    activeFile,
    selectedFilePaths,
    onToggleFile
}: {
    node: FileNode;
    level: number;
    onFileClick: (path: string) => void;
    activeFile: string;
    selectedFilePaths: string[];
    onToggleFile: (path: string) => void;
}) => {
    const isChecked = selectedFilePaths.includes(node.path);

    return (
        <div
            className={`cursor-pointer py-0.5 px-1 rounded flex items-center
          ${activeFile === node.path ? 'bg-[#373737]' : 'hover:bg-[#2a2d2e]'}`}
            style={{ paddingLeft: level * 14 + 16 }}
        >
            <input
                type="checkbox"
                checked={isChecked}
                onChange={e => {
                    e.stopPropagation();
                    onToggleFile(node.path);
                }}
                onClick={e => e.stopPropagation()}
                className="mr-2 cursor-pointer"
            />
            <span onClick={() => onFileClick(node.path)}>{node.name}</span>
        </div>
    );
};

const getLanguage = (file: string) => {
    if (file.endsWith('.ts') || file.endsWith('.tsx')) return 'typescript';
    if (file.endsWith('.js') || file.endsWith('.jsx')) return 'javascript';
    if (file.endsWith('.json')) return 'json';
    if (file.endsWith('.css')) return 'css';
    if (file.endsWith('.html')) return 'html';
    return 'plaintext';
};

const MonacoEditor = ({ content, file }: { content: string; file: string }) => {
    return (
        <div className="flex flex-col bg-[#1e1e1e]" style={{ flex: 1, minWidth: 0 }}>
            <div className="h-9 bg-[#2d2d2d] border-b border-[#333] px-4 flex items-center text-sm text-[#cccccc]">{file || 'No file selected'}</div>

            <Editor
                height="100%"
                language={getLanguage(file)}
                value={content}
                theme="vs-dark"
                options={{
                    readOnly: false,
                    fontSize: 16,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    automaticLayout: true,
                    cursorStyle: 'line',
                    renderLineHighlight: 'line'
                }}
            />
        </div>
    );
};
