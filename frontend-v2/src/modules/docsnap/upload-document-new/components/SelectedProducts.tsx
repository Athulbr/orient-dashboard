interface Variation {
    SKU: string;
    size?: string;
    color?: string;
    price?: number;
}

interface Product {
    SKU: string;
    name: string;
    description: string;
    variations: Variation[];
}

interface SelectedProductsProps {
    products: Product[];
}

const SelectedProducts: React.FC<SelectedProductsProps> = ({ products }) => {
    return (
        <div className="p-6 bg-white shadow-2xl rounded-xl m-2   border border-gray-100 ring-1 ring-gray-200">
            <div className="space-y-6  overflow-y-auto pr-3">
                {products.map(product => (
                    <div
                        key={product.SKU}
                        className="p-4 bg-gray-50 rounded-lg border border-gray-200 shadow-sm transition duration-200 hover:shadow-md hover:border-indigo-300"
                    >
                        <div className="flex justify-between items-start mb-2">
                            <h2 className="text-lg font-bold text-indigo-700">{product.name || 'Untitled Product'}</h2>
                            <span className="text-sm font-mono text-gray-600 bg-indigo-100 px-3 py-1 rounded-full border border-indigo-200">{product.SKU}</span>
                        </div>

                        <p className="text-sm text-gray-500 mb-3 line-clamp-2">{product.description || 'Description not available.'}</p>

                        <h3 className="text-md font-semibold text-gray-800 mt-3 mb-1">Variations ({product.variations.length})</h3>

                        <ul className="divide-y divide-gray-200 border-t border-gray-200">
                            {product.variations.length > 0 ? (
                                product.variations.map((variation, index) => (
                                    <li key={index} className="flex justify-between items-center py-2 text-sm group">
                                        <span className="font-medium text-gray-700 group-hover:text-indigo-600 transition-colors">{variation.SKU}</span>

                                        <div className="text-xs text-gray-500 space-x-3">
                                            {variation.size && <span className="text-gray-600">Size: {variation.size}</span>}
                                            {variation.color && <span className="text-gray-600">Color: {variation.color}</span>}
                                            {variation.price && (
                                                <span className="font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded">${variation.price.toFixed(2)}</span>
                                            )}
                                        </div>
                                    </li>
                                ))
                            ) : (
                                <li className="text-sm italic text-gray-400 py-2">No specific variations found for this product.</li>
                            )}
                        </ul>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SelectedProducts;
