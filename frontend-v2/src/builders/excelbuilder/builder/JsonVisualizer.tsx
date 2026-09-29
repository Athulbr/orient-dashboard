const normalizePath = (path: string) => {
    return path.replace(/\[\d+\]/g, '[*]');
};

export const JsonVisualizerComponent = ({ data, path = '', onSelect }: { data: any; path?: string; onSelect: (p: string) => void }) => {
    const isObject = data !== null && typeof data === 'object';
    const isArray = Array.isArray(data);

    if (data === null || data === undefined) {
        return <span className="text-gray-400 italic text-xs">null</span>;
    }

    if (!isObject) {
        return (
            <button
                onClick={e => {
                    e.stopPropagation();
                    onSelect(normalizePath(path));
                }}
                className="hover:bg-blue-100 hover:text-blue-700 bg-gray-50 px-3 py-1 rounded border border-gray-200 text-sm font-mono text-gray-700 transition-colors cursor-pointer shadow-sm hover:shadow"
            >
                {String(data)}
            </button>
        );
    }

    return (
        <div
            className={`
            flex flex-col gap-2 p-3 rounded border
            ${path === '' ? 'border-none p-0' : 'border-gray-300 bg-white shadow-sm ml-4'}
        `}
        >
            {path && (
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-0 select-none">
                    {path
                        .split('.')
                        .pop()
                        ?.replace(/\[.*?\]/, ' []')}
                </div>
            )}

            <div className="flex flex-wrap gap-3 items-start">
                {Object.keys(data).map(key => {
                    if (isArray && parseInt(key) > 1) return null;

                    const currentPath = path ? (isArray ? `${path}[${key}]` : `${path}.${key}`) : key;

                    return (
                        <div key={key} className="flex flex-col">
                            {!isArray && <span className="text-xs font-semibold text-gray-600 mb-1 ml-1 select-none">{key}:</span>}
                            <JsonVisualizerComponent data={data[key]} path={currentPath} onSelect={onSelect} />
                        </div>
                    );
                })}
                {isArray && data.length > 2 && <span className="text-xs text-gray-400 self-center">...more</span>}
            </div>
        </div>
    );
};
