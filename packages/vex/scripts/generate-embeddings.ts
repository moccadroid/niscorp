import { createSignal } from '@niscorp/signal';
import fs from 'node:fs';
import path from 'node:path';

const FIXTURE_PATH = path.resolve(import.meta.dirname ?? '.', 'fixtures', 'product-embeddings.json');

const PRODUCT_DATA: Array<{ name: string; description: string }> = [
  { name: 'iPhone 16 Pro', description: 'Latest Apple smartphone with A18 chip' },
  { name: 'Samsung Galaxy S25', description: 'Samsung flagship with AI features' },
  { name: 'Google Pixel 9', description: 'Pure Android experience with great camera' },
  { name: 'MacBook Pro 16"', description: 'Apple laptop with M4 Pro chip' },
  { name: 'Dell XPS 15', description: 'Premium Windows ultrabook' },
  { name: 'ThinkPad X1 Carbon', description: 'Business ultrabook with excellent keyboard' },
  { name: 'AirPods Pro 3', description: 'Wireless earbuds with noise cancellation' },
  { name: 'Sony WH-1000XM6', description: 'Over-ear noise cancelling headphones' },
  { name: 'iPad Air M3', description: 'Versatile tablet for work and play' },
  { name: 'Kindle Paperwhite', description: 'E-reader with warm light display' },
  { name: 'Classic Oxford Shirt', description: 'Timeless button-down cotton shirt' },
  { name: 'Slim Fit Chinos', description: 'Comfortable everyday chino pants' },
  { name: 'Wool Blazer', description: 'Tailored wool blend blazer' },
  { name: 'Summer Dress', description: 'Light floral print summer dress' },
  { name: 'Cashmere Sweater', description: 'Luxurious cashmere pullover' },
  { name: 'Running Jacket', description: 'Waterproof lightweight running jacket' },
  { name: 'Garden Tool Set', description: '12-piece stainless steel garden tools' },
  { name: 'LED Desk Lamp', description: 'Adjustable brightness desk lamp' },
  { name: 'Smart Thermostat', description: 'WiFi-enabled programmable thermostat' },
  { name: 'Robot Vacuum', description: 'AI-powered robotic vacuum cleaner' },
  { name: 'Standing Desk', description: 'Electric height-adjustable desk' },
  { name: 'The Great Gatsby', description: 'Classic novel by F. Scott Fitzgerald' },
  { name: '1984', description: 'Dystopian novel by George Orwell' },
  { name: 'Clean Code', description: 'Software craftsmanship by Robert C. Martin' },
  { name: 'Design Patterns', description: 'Elements of reusable OO software' },
  { name: 'DUNE', description: 'Science fiction epic by Frank Herbert' },
  { name: 'Yoga Mat', description: 'Non-slip exercise yoga mat 6mm' },
  { name: 'Resistance Bands Set', description: '5-piece resistance band set' },
  { name: 'Trail Running Shoes', description: 'All-terrain trail running shoes' },
  { name: 'Camping Tent 4P', description: '4-person waterproof camping tent' },
  { name: 'Hiking Backpack 40L', description: 'Ergonomic 40-liter hiking backpack' },
  { name: 'Trekking Poles', description: 'Carbon fiber adjustable trekking poles' },
  { name: 'Sleeping Bag', description: 'Lightweight 3-season sleeping bag' },
  { name: 'USB-C Hub', description: '7-in-1 USB-C multiport adapter' },
  { name: 'Mechanical Keyboard', description: 'Cherry MX Brown mechanical keyboard' },
  { name: 'Wireless Mouse', description: 'Ergonomic wireless mouse with USB-C' },
  { name: '4K Monitor 27"', description: '27-inch IPS 4K HDR monitor' },
  { name: 'Webcam HD', description: '1080p webcam with ring light' },
  { name: 'Portable Charger', description: '20000mAh power bank with fast charge' },
  { name: 'Bluetooth Speaker', description: 'Waterproof portable bluetooth speaker' },
  { name: 'Cotton T-Shirt Pack', description: '3-pack premium cotton crew neck tees' },
  { name: 'Leather Belt', description: 'Genuine leather dress belt' },
  { name: 'Denim Jacket', description: 'Classic wash denim trucker jacket' },
  { name: 'Silk Blouse', description: 'Elegant silk button-up blouse' },
  { name: 'Linen Pants', description: 'Relaxed fit linen trousers' },
  { name: 'Rain Boots', description: 'Waterproof rubber rain boots' },
  { name: 'Cookbook Italian', description: 'Authentic Italian home cooking recipes' },
  { name: 'Water Bottle 1L', description: 'Insulated stainless steel water bottle' },
  { name: 'Dumbbells Set', description: 'Adjustable dumbbells 5-50 lbs' },
  { name: 'Jump Rope', description: 'Speed jump rope with ball bearings' },
];

const main = async () => {
  if (fs.existsSync(FIXTURE_PATH)) {
    console.log(`Fixture already exists: ${FIXTURE_PATH}`);
    console.log('Delete it to regenerate.');
    return;
  }

  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    console.error('OPENAI_API_KEY required to generate embeddings');
    process.exit(1);
  }

  const embedder = createSignal('openai', { apiKey, model: 'text-embedding-3-small' });
  const texts = PRODUCT_DATA.map(p => `${p.name}: ${p.description}`);

  console.log(`Embedding ${texts.length} products...`);
  const vectors = await embedder.embed(texts);
  console.log(`Done. Dimensions: ${vectors[0]!.length}`);

  const fixtureDir = path.dirname(FIXTURE_PATH);
  if (!fs.existsSync(fixtureDir)) fs.mkdirSync(fixtureDir, { recursive: true });

  fs.writeFileSync(FIXTURE_PATH, JSON.stringify(vectors, null, 0));
  console.log(`Saved to ${FIXTURE_PATH} (${Math.round(fs.statSync(FIXTURE_PATH).size / 1024)}KB)`);
};

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
