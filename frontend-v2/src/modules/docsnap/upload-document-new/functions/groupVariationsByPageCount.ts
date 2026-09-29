export interface ProductRowIF {
    'Page Count': number;
    'Variation Style': string;
    'Product or Variation': string;
    SKU: string;
    Description: string;
    "Manufacturer's URL": string;
    UOM: string;
    Quantity: number;
    Cost: string;
    CSFP: string;
    MAP: string;
    'Dealer Shipping Cost': string;
    'Additional Fees': string;
    'Price Method': string;
    'Vendor Code': string;
    'Product Vendor': string;
    'Product Manufacturer': string;
    'Product Category': string;
    'Variation Image': string;
}

export const groupVariationsByPageCount = (products: ProductRowIF[]): ProductRowIF[][] => {
    const groupedMap = products.reduce(
        (accumulator: Record<number, ProductRowIF[]>, product: ProductRowIF) => {
            const pageCount = product['Page Count'];
            if (!accumulator[pageCount]) {
                accumulator[pageCount] = [];
            }
            accumulator[pageCount].push(product);
            return accumulator;
        },
        {} as Record<number, ProductRowIF[]>
    );

    return Object.values(groupedMap);
};

const sampleProductRow: ProductRowIF = {
    'Page Count': 1,
    'Variation Style': 'Table',
    'Product or Variation': 'Product',
    SKU: 'BN-KIT113-BT',
    Description: 'Activity Table 18" x 30" Black Edge - Black Legs Adjusts 15" - 24"',
    "Manufacturer's URL": 'https://bintiva.com/products/activity-table-with-adjustable-legs-1?variant=43584604667956',
    UOM: 'Each',
    Quantity: 1,
    Cost: '$99.00',
    CSFP: '$159.33',
    MAP: '$159.33',
    'Dealer Shipping Cost': '$0.00',
    'Additional Fees': '$0.00',
    'Price Method': 'CSFP',
    'Vendor Code': 'test',
    'Product Vendor': 'test',
    'Product Manufacturer': 'test',
    'Product Category': 'test',
    'Variation Image': 'Not Available'
};
