export type SeedProduct = {
  title: string
  category: 'toys' | 'home'
  asset: string
  price: number
  compareAt: { marketplace: 'amazon' | 'flipkart' | 'meesho'; price: number }
  variants: Array<{ name: string; swatch?: string; stock: number }>
  badge: 'none' | 'bestseller' | 'new' | 'limited'
  ageGroup?: string
  hsnCode: string
  gstRate: number
  shipping: { weightGrams: number; lengthCm: number; widthCm: number; heightCm: number }
  shortDescription: string
  highlights: string[]
}

export const seedCategories = [
  { key: 'toys', title: 'Toys & Games', tileColor: 'cobalt', order: 1 },
  { key: 'home', title: 'Kitchen & Home', tileColor: 'mint', order: 2 },
] as const

export const seedProducts: SeedProduct[] = [
  {
    title: 'Karaoke speaker with 2 wireless mics',
    category: 'toys',
    asset: 'karaoke.png',
    price: 1299,
    compareAt: { marketplace: 'amazon', price: 1499 },
    variants: [{ name: 'Default', stock: 8 }],
    badge: 'bestseller',
    ageGroup: '5+',
    hsnCode: '8518',
    gstRate: 18,
    shipping: { weightGrams: 900, lengthCm: 20, widthCm: 15, heightCm: 15 },
    shortDescription: 'A portable Bluetooth speaker with two wireless mics for family sing-alongs.',
    highlights: ['Two wireless microphones included', 'Bluetooth and USB playback', 'Rechargeable battery'],
  },
  {
    title: 'Duck climbing track toy with music',
    category: 'toys',
    asset: 'duck.jpg',
    price: 549,
    compareAt: { marketplace: 'flipkart', price: 649 },
    variants: [{ name: 'Default', stock: 10 }],
    badge: 'new',
    ageGroup: '3+',
    hsnCode: '9503',
    gstRate: 12,
    shipping: { weightGrams: 700, lengthCm: 30, widthCm: 20, heightCm: 10 },
    shortDescription: 'Little ducks climb a colourful track while cheerful music plays.',
    highlights: ['Plays music and lights', 'Easy to assemble track', 'Safe, child-friendly plastic'],
  },
  {
    title: 'Mexico premium container, set of 2',
    category: 'home',
    asset: 'container.png',
    price: 449,
    compareAt: { marketplace: 'meesho', price: 549 },
    variants: [
      { name: 'Mint', swatch: '#8FC9B5', stock: 6 },
      { name: 'Sand', swatch: '#D9C7A7', stock: 3 },
    ],
    badge: 'none',
    hsnCode: '3924',
    gstRate: 18,
    shipping: { weightGrams: 800, lengthCm: 25, widthCm: 15, heightCm: 15 },
    shortDescription: 'Two airtight storage containers that keep spices and snacks fresh.',
    highlights: ['Airtight lids', 'Stackable design', 'Food-safe material'],
  },
  {
    title: 'Portable juicer, 400 ml, USB charging',
    category: 'home',
    asset: 'juicer.jpg',
    price: 799,
    compareAt: { marketplace: 'amazon', price: 949 },
    variants: [{ name: 'Default', stock: 5 }],
    badge: 'none',
    hsnCode: '8509',
    gstRate: 18,
    shipping: { weightGrams: 600, lengthCm: 22, widthCm: 12, heightCm: 12 },
    shortDescription: 'A cordless 400 ml juicer you can charge over USB and take anywhere.',
    highlights: ['400 ml capacity', 'USB rechargeable', 'Easy to clean'],
  },
  {
    title: 'Induction flight RC helicopter',
    category: 'toys',
    asset: 'helicopter.jpg',
    price: 699,
    compareAt: { marketplace: 'amazon', price: 849 },
    variants: [{ name: 'Default', stock: 4 }],
    badge: 'none',
    ageGroup: '6+',
    hsnCode: '9503',
    gstRate: 12,
    shipping: { weightGrams: 400, lengthCm: 35, widthCm: 18, heightCm: 8 },
    shortDescription: 'A remote-controlled helicopter that charges in minutes and hovers steadily.',
    highlights: ['Remote control included', 'Stable hover mode', 'USB charging'],
  },
]

export const heroData = {
  pill: 'Diwali gift picks are here',
  headline: 'Fun for little hands. Joy for the whole home.',
  highlightWord: 'Joy',
  subtext:
    'Toys, gadgets and kitchen favourites from a small family business. The same products you know from Amazon and Flipkart, for less, with real people to talk to on WhatsApp.',
  ctaPrimary: { label: 'Shop toys →', link: '/c/toys-and-games' },
  ctaSecondary: { label: 'Kitchen & home', link: '/c/kitchen-and-home' },
  stickerText: 'Bestseller!',
}

export const announcements = [
  'Cash on delivery available',
  'Dispatched within 24 hours',
  'Cheaper here than on Amazon, Flipkart & Meesho',
]

export const linksData = {
  tagline: 'Daily finds • Home • Toys',
  buttons: [
    { label: 'Shop on our website', url: '/', iconType: 'shop', highlight: true },
    { label: 'Chat on WhatsApp', url: 'https://wa.me/910000000000', iconType: 'whatsapp' },
    { label: 'Amazon store', url: 'https://example.com/amazon', iconType: 'amazon' },
    { label: 'Flipkart store', url: 'https://example.com/flipkart', iconType: 'flipkart' },
    { label: 'Meesho store', url: 'https://example.com/meesho', iconType: 'meesho' },
  ],
} as const
