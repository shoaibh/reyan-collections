import { lexicalDoc, type LexicalBlock } from './lexical'

const WARNING: LexicalBlock = {
  type: 'p',
  text: '⚠ Review before publishing: this is a starting template, not legal advice.',
}

const placeholder = (text: string): LexicalBlock => ({ type: 'p', text })

const sections = (items: Array<[string, string]>): LexicalBlock[] =>
  items.flatMap(([heading, body]) => [{ type: 'h2' as const, text: heading }, placeholder(body)])

export const seedPages = [
  {
    title: 'About us',
    slug: 'about',
    blocks: sections([
      ['Who we are', 'Reyan Collections is a small family business selling toys, gadgets and kitchen favourites.'],
      ['What we sell', 'A hand-picked range of products we have tested and love, at fair prices.'],
      ['Why shop with us', 'Real people reply on WhatsApp, and every order ships with a proper GST invoice.'],
    ]),
  },
  {
    title: 'Contact us',
    slug: 'contact',
    blocks: sections([
      ['Talk to us', 'Message us on WhatsApp at +91 00000 00000 for the quickest reply.'],
      ['Email', 'Write to hello@example.com and we will reply within one working day.'],
      ['Business hours', 'Monday to Saturday, 10 am to 7 pm IST.'],
    ]),
  },
  {
    title: 'Shipping policy',
    slug: 'shipping-policy',
    blocks: sections([
      ['Dispatch time', 'Orders are dispatched within 24 hours on working days.'],
      ['Delivery time', 'Delivery usually takes 3 to 7 working days, depending on your location.'],
      ['Shipping charges', 'A flat shipping fee applies, and orders above the free-shipping amount ship free.'],
      ['Tracking', 'You will receive a tracking link by message once your order ships.'],
    ]),
  },
  {
    title: 'Return policy',
    slug: 'return-policy',
    blocks: sections([
      ['Return window', 'You can request a return or replacement within 7 days of delivery.'],
      ['Eligible items', 'Items must be unused and in the original packaging.'],
      ['Damaged or wrong items', 'Send us photos on WhatsApp and we will arrange a replacement.'],
      ['Refunds', 'Refunds are issued to the original payment method within 7 working days.'],
    ]),
  },
  {
    title: 'Privacy policy',
    slug: 'privacy-policy',
    blocks: sections([
      ['What we collect', 'We collect the details needed to deliver your order: name, phone, address and email.'],
      ['How we use it', 'We use your details only to process orders, send updates and provide support.'],
      ['Sharing', 'We share details only with payment and courier partners who need them to serve you.'],
      ['Your rights', 'You can ask us to correct or delete your data at any time by contacting us.'],
    ]),
  },
  {
    title: 'Terms and conditions',
    slug: 'terms',
    blocks: sections([
      ['Using this site', 'By using this website you agree to these terms.'],
      ['Orders and pricing', 'Prices are in Indian rupees and may change without notice until an order is placed.'],
      ['Payments', 'We accept UPI, cards, netbanking and cash on delivery on eligible orders.'],
      ['Liability', 'Our liability is limited to the value of the order to the extent permitted by law.'],
    ]),
  },
].map((page) => ({
  title: page.title,
  slug: page.slug,
  content: lexicalDoc([WARNING, ...page.blocks]),
}))
