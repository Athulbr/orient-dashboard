export const entitySchema = {
    fields: {
        po_number: {
            type: 'str',
            description: 'Purchase Order Number',
            instruction:
                "Look for labels such as 'PO Number', 'PO #', 'Purchase Order #','Service Authorization Number' or similar. Extract the full alphanumeric identifier without any prefixes."
        },
        contact_email: {
            type: 'str',
            description: 'contact Email',
            instruction: "Extract any valid email address associated with the buyer or purchasing department. It should contain an '@' symbol and a domain."
        },
        phone_number: {
            type: 'str',
            description: 'contact Phone Number',
            instruction:
                "Extract the complete phone number associated, including area code if available. don't include any vendor phone number. If no phone number is present keep value as null."
        },
        contract_number: { type: 'str', description: 'Contract Number', instruction: "extract Contract Number or  '16. Contract Number' from the document" },
        ship_to: {
            type: 'dict',
            description: 'Shipping or Delivery Address',
            instruction:
                "Extract the shipping address from 'Ship to' or 'Shipping Address' or 'Delivery Instructions' or 'Delivery Address' or similar labels. understand and don't include vendor address or 'To' or any vendor details like rehabmart LLC and its details. Include all relevant information such as names, street address, city, state, and ZIP code. If multiple names are present, include them in the 'name' field separated by 'or'. The address may include additional details like suite numbers.  extract shipping information.                     ",
            fields: {
                name: { type: 'str', description: 'Name of company or individual', instruction: 'full name individual or name of individual if available ' },
                attn: { type: 'str', description: 'Attention to (if present)', instruction: '' },
                street: { type: 'str', description: 'Street address including suite/unit if available', instruction: 'street of shipping address' },
                city: { type: 'str', description: 'City name', instruction: 'city of shipping address' },
                state: { type: 'str', description: 'State (two-letter abbreviation)', instruction: '' },
                zip: { type: 'str', description: 'ZIP code (5 or 9 digit format)', instruction: '' },
                phone_number: {
                    type: 'str',
                    description: 'Phone number of the ship to adress.',
                    instruction: 'Extract the complete phone number, including area code. extract phone number from the ship to adress. if present'
                }
            }
        },
        bill_to: {
            type: 'dict',
            description: 'Billing Address or invoice address',
            instruction:
                "Extract billing address from labels like 'Bill To:' or 'Billing Address:' or 'invoice address' or 'invoice to' or similar. Do not include vendor addresses or 'To:' or email instructions. make sure you extract address which respect to billing information",
            fields: {
                bill_to_company: {
                    type: 'str',
                    description: 'Name of the VA facility',
                    instruction:
                        "Extract the full name of the VA facility or medical center. it represents which company or VA facility we are received order from. KEEP it as same name mentioned in 'FROM:'"
                },
                bill_to_name: {
                    type: 'str',
                    description: 'name of the purchase agent who is making the purchase order',
                    instruction: 'extract it from purchase agent field or from Fax page who is making purchase order. or received from whom'
                },
                attn: { type: 'str', description: 'Attention to (if present)', instruction: '' },
                street: { type: 'str', description: 'Street address including suite/unit if available', instruction: '' },
                city: { type: 'str', description: 'City name', instruction: '' },
                state: { type: 'str', description: 'State (two-letter abbreviation)', instruction: '' },
                zip: { type: 'str', description: 'ZIP code (5 or 9 digit format)', instruction: '' },
                phone_number: {
                    type: 'str',
                    description: 'Phone number of the bill to adress',
                    instruction: 'Extract the complete phone number, including area code. pick the phone number from the bill to adress. if present.'
                }
            }
        },
        line_items: {
            type: 'list',
            description:
                'List of ordered items, (extract all the sku values, inside a table, even if there are no other column details provided. take an individual sku number as a row while keeping other column values empty, incase any column details provided pick them appropriately. )',
            instruction:
                "Extract all line items from the order. Ensure each item is complete and unique. Do not duplicate or split items. extract exact table as it is.\nNote: Locate all the occurences of SKU number. and take each sku occurence as a row. if all the olther colum details are empty. keep them empty. but make sure to pick all the sku occurences as individual row.\nPick the corresponding Description and other column details if present.\n\n'SKU' value description: locate  'Vendor Catalog #:', 'Model: ', 'MFR NO #:', or 'Item #' or 'SKU ' or similar keys which can represent sku value",
            is_list: true,
            item_fields: {
                sku_number: {
                    type: 'str',
                    description: 'SKU number',
                    instruction:
                        "Extract unique identifier from description like 'Vendor Catalog #:', 'Model: ', 'MFR NO #:', or 'Item #' or 'SKU ' or similar keys which can represent sku value"
                },
                rehab_id: {
                    type: 'str',
                    description: 'Rehab ID',
                    instruction:
                        "Extract the 'Rehabmart ID' or 'rehabmart number' from the description or relavant ID from description if present. lf not leave it as blank."
                },
                description: {
                    type: 'str',
                    description: 'Item description',
                    instruction:
                        "Extract only the description and remove any SKU number, alphanumeric codes, or suffixes and prefixes like 'Vendor Catalog #:', 'Model:', 'MFR NO #:', or 'Item #'. Remove any text after 'Model:' or similar words if present."
                },
                quantity: { type: 'int', description: 'Quantity ordered', instruction: 'Extract the numerical quantity as an integer.' },
                unit_price: {
                    type: 'str',
                    description: 'Price per unit',
                    instruction: 'Extract the price for a single unit as a float, removing any currency symbols.'
                },
                total_price: {
                    type: 'str',
                    description: 'Total price for the item',
                    instruction: 'Extract the total price for this line item as a float, removing any currency symbols.'
                }
            }
        },
        subtotal: {
            type: 'str',
            description: 'Subtotal of all line items',
            instruction: 'Extract the subtotal amount before tax and shipping. convert it as float'
        },
        tax: { type: 'str', description: 'Total tax amount', instruction: 'Extract the total tax amount if specified. get it as float' },
        shipping_cost: { type: 'str', description: 'Shipping cost', instruction: 'Extract the shipping cost if specified. get it as float' },
        discount: { type: 'str', description: 'Discount Cost', instruction: 'Extract thediscounted cost if specified. get it as float' },
        total_amount: {
            type: 'str',
            description: 'Total order amount including tax and shipping',
            instruction: 'Extract the final total amount of the order. get it as float'
        },
        quote_id: {
            type: 'str',
            description: 'Quote ID',
            instruction: 'Extract the quote ID or quote # or which starts with "QT" from the document. don\'t add any po number or any other to here'
        }
    }
};
