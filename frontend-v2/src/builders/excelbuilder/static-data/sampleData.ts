export const sampleRecordData: any[] = [
    {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
        address: {
            street: '123 Main St',
            city: 'Anytown'
        },
        games: [
            { name: 'chess', type: 'indoor' },
            { name: 'swimming', type: 'outdoor' }
        ],
        hobbies: [{ name: { value: 'reading' }, type: { value: 'indoor' } }]
    },
    {
        name: 'Kiran',
        email: 'kiran@example.com',
        age: 25,
        address: {
            street: '456 Oak Ave',
            city: 'Othertown'
        },
        games: [
            { name: 'cooking', type: 'indoor' },
            { name: 'traveling', type: 'outdoor' },
            { name: 'cricket', type: 'outdoor' }
        ],
        extra: {
            hobbies: [
                { name: { value: 'painting' }, type: { value: 'indoor' } },
                { name: { value: 'cycling' }, type: { value: 'outdoor' } }
            ]
        }
    },

    // ------------------------------------
    // MORE DATA WITH MISSING FIELDS
    // ------------------------------------

    {
        name: 'Aarav Sharma',
        email: 'aarav.sharma@example.com',
        age: 28,
        address: {
            street: '789 Pine Road',
            city: 'Bengaluru'
        },
        games: [
            { name: 'badminton', type: 'indoor' },
            { name: 'football', type: 'outdoor' }
        ],
        hobbies: [
            { name: { value: 'gardening' }, type: { value: 'outdoor' } },
            { name: { value: 'yoga' }, type: { value: 'indoor' } }
        ]
    },

    // ❌ Missing hobbies
    {
        name: 'Emily Watson',
        email: 'emily.watson@example.com',
        age: 32,
        address: {
            street: '22 Lake View St',
            city: 'Chicago'
        },
        games: [
            { name: 'table tennis', type: 'indoor' },
            { name: 'skiing', type: 'outdoor' }
        ],
        hobbies: [] // empty
    },

    // ❌ Missing games
    {
        name: 'Rohan Kulkarni',
        email: 'rohan.k@example.com',
        age: 22,
        address: {
            street: '88 MG Road',
            city: 'Pune'
        },
        games: [], // no games
        hobbies: [{ name: { value: 'music' }, type: { value: 'indoor' } }]
    },

    // ❌ Missing address
    {
        name: 'Sophia Lee',
        email: 'sophia.lee@example.com',
        age: 29,
        address: null, // missing address
        games: [{ name: 'piano', type: 'indoor' }],
        hobbies: [{ name: { value: 'calligraphy' }, type: { value: 'indoor' } }]
    },

    // ❌ Missing email
    {
        name: 'Michael Brown',
        email: null,
        age: 34,
        address: {
            street: '9 Sunset Blvd',
            city: 'Los Angeles'
        },
        games: [{ name: 'basketball', type: 'outdoor' }],
        hobbies: [{ name: { value: 'gaming' }, type: { value: 'indoor' } }]
    },

    // ❌ Missing nested fields inside hobbies
    {
        name: 'Aleena Roy',
        email: 'aleena.roy@example.com',
        age: 27,
        address: {
            street: '41 Maple Street',
            city: 'Mumbai'
        },
        games: [{ name: 'volleyball', type: 'outdoor' }],
        hobbies: [
            { name: { value: 'sketching' } }, // missing "type"
            { type: { value: 'indoor' } } // missing "name"
        ]
    },

    // ❌ Missing age & partial address
    {
        name: 'Daniel Smith',
        email: 'dan.smith@example.com',
        age: null,
        address: {
            street: null,
            city: 'New York'
        },
        games: [{ name: 'running', type: 'outdoor' }],
        hobbies: [{ name: { value: 'traveling' }, type: { value: 'outdoor' } }]
    },

    // ❌ Missing everything except name
    {
        name: 'Unknown User',
        email: null,
        age: null,
        address: null,
        games: null,
        hobbies: null
    }
];
