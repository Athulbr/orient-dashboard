import { ProductRowIF } from './groupVariationsByPageCount';

// FIX 1: Change the input type from ProductRowIF[][] to ProductRowIF[]
const createVariationsGroup = (variations: ProductRowIF[]) => {
    // FIX 2: Rename the input variable for clarity
    const groupedMap = variations.reduce(
        (accumulator: Record<string, any[]>, product: ProductRowIF) => {
            // FIX 3: Change key type to string if 'Product or Variation' is a string. Assuming 'pageCount' is the intended grouping key, let's look closer.

            // Assuming the 'Product or Variation' column holds the value you want to group by (e.g., a page count, a color, etc.).
            // I'll keep the key as 'pageCount' but use string for robustness since object keys are always strings or symbols.
            const groupKey = product['Product or Variation'];

            // IMPORTANT: If 'Product or Variation' is a descriptive string (like "Red", "Blue"),
            // you should use that. If you intended to group by a property like 'pageCount'
            // which isn't shown, you must replace the line above.
            // I'm using groupKey for clarity.

            if (!accumulator[groupKey]) {
                accumulator[groupKey] = [];
            }
            const data = {
                SKU: product.SKU,
                Description: product.Description,
                UOM: product.UOM,
                Quantity: product.Quantity,
                Cost: product.Cost,
                CSFP: product.CSFP,
                MAP: product.MAP,
                'Dealer Shipping Cost': product['Dealer Shipping Cost'],
                'Additional Fees': product['Additional Fees'],
                'Price Method': product['Price Method'],
                // 'Vendor Code': product['Vendor Code'],
                // 'Product Vendor': product['Product Vendor'],
                // 'Product Manufacturer': product['Product Manufacturer'],
                // 'Product Category': product['Product Category'],
                'Variation Image': 'Not Available'
            };
            accumulator[groupKey].push(data);
            return accumulator;
        },
        // FIX 4: Change the initial accumulator type to match the key type (string)
        {} as Record<string, any[]>
    );
    // The variations array is now an array of arrays, where each inner array is a group (e.g., all 'Red' variations)
    return Object.values(groupedMap);
};

export const createProductWithVariationGroups = (groupedVariations: ProductRowIF[][]) => {
    const products = groupedVariations.map((wholeProduct: ProductRowIF[]) => {
        const firstRow = wholeProduct[0];
        if (firstRow['Product or Variation']?.toLowerCase() !== 'product') {
            throw new Error('First row should be Product');
        }
        const remainingRows = wholeProduct.slice(1);

        // FIX 5: The type for variationGroups should be ProductRowIF[][] because the
        // createVariationsGroup function returns an array of groups (an array of arrays).
        const variationGroups: any[][] = createVariationsGroup(remainingRows);

        return {
            ...firstRow,
            variationGroups: variationGroups // group of variations (ProductRowIF[][]),
        };
    });
    return products;
};
