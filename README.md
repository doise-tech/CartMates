# CartMates

A browser extension for shopping together: browse live as a group, save to a shared list, decide, then check out on the store's own site.

## Backend (Supabase)

`supabase/migrations` builds the database, in order:

- `0000` clears an earlier empty draft
- `0001` creates the tables (profiles, lists, parties, products, list items, tags, reactions, messages)
- `0002` adds the house rules as Row Level Security, plus the `join_party` and `save_item` actions
- `0003` ends parties automatically after 6 quiet hours

`supabase/tests/house_rules_test.sql` plays out a full party with three pretend users, checks each rule, and rolls everything back.

`supabase/config.example.env` holds the project URL and publishable key for the extension. Both are safe to ship, because the security rules protect the data.
