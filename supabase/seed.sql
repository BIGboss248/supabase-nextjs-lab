-- Demo catalogue: 8 rows, which is also the ceiling the listing page can show.
-- Six are published (four in stock, one sold out, one low), so an anonymous
-- visitor sees six cards and the two drafts stay invisible under RLS.
-- Re-runnable: the unique slug makes a repeat seed a no-op.

insert into public.products (slug, name, description, price_minor, currency, stock, image_url, published)
values
  ('ethiopia-guji-natural', 'Ethiopia Guji Natural', 'Blueberry and jasmine, sun-dried on raised beds.', 1850, 'USD', 24, 'https://picsum.photos/seed/ethiopia-guji-natural/600/450', true),
  ('colombia-huila-washed', 'Colombia Huila Washed', 'Caramel and red apple, the everyday filter roast.', 1650, 'USD', 40, 'https://picsum.photos/seed/colombia-huila-washed/600/450', true),
  ('kenya-nyeri-ab', 'Kenya Nyeri AB', 'Blackcurrant and grapefruit, high acidity and long finish.', 1950, 'USD', 12, 'https://picsum.photos/seed/kenya-nyeri-ab/600/450', true),
  ('sumatra-mandheling', 'Sumatra Mandheling', 'Cedar and dark chocolate, low acidity and heavy body.', 1750, 'USD', 8, 'https://picsum.photos/seed/sumatra-mandheling/600/450', true),
  ('decaf-colombia-sugarcane', 'Decaf Colombia Sugarcane', 'Cocoa and plum, decaffeinated with sugarcane ethanol.', 1700, 'USD', 0, 'https://picsum.photos/seed/decaf-colombia-sugarcane/600/450', true),
  ('guatemala-antigua', 'Guatemala Antigua', 'Toffee and orange peel, the last bags of the season.', 1800, 'USD', 2, 'https://picsum.photos/seed/guatemala-antigua/600/450', true),
  ('rwanda-nyamasheke', 'Rwanda Nyamasheke', 'Honey and bergamot, a lot still waiting on a cupping score.', 1900, 'USD', 15, 'https://picsum.photos/seed/rwanda-nyamasheke/600/450', false),
  ('costa-rica-tarrazu-honey', 'Costa Rica Tarrazú Honey', 'Stone fruit and brown sugar, honey-processed, not yet listed.', 2000, 'USD', 6, 'https://picsum.photos/seed/costa-rica-tarrazu-honey/600/450', false)
on conflict (slug) do nothing;
