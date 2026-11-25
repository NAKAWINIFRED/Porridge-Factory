# Porridge Factory: database files (version 2)

These files set up the PostgreSQL database. You run them yourself in **pgAdmin**. The app never creates or changes tables on its own.

| File | When to use it |
|---|---|
| `00_create_database.sql` | Optional: creates the database `porridge_factory`. Easier: right-click **Databases → Create → Database…** in pgAdmin. (pgAdmin's Query Tool may refuse this file with *cannot run inside a transaction block*; if so, use the Create window.) |
| `01_create_schema.sql` | Creates all tables and stock views **inside `porridge_factory`**. Run once. |
| `02_upgrade_from_v1.sql` | **You already used the earlier version** (the one that made its own tables). Converts your existing records to version 2. Run once. |
| `03_useful_queries.sql` | Ready-made queries for checking stock, money and production in pgAdmin. Read-only. |
| `04_create_app_login.sql` | Optional. A login just for the app (`porridge_app`), so you don't need the `postgres` password. |
| `05_ugx_and_remove_sample.sql` | Only for a database set up before UGX was the default: switches the currency to **UGX** and clears out any leftover demo records. Your own records stay. |

You need PostgreSQL 13 or newer.

---

## A. New database

The factory gets its **own database**. Don't run these files inside `paywise_mirror` or any other existing database.

**Step 1: create the database**
1. In pgAdmin's tree, click the **`postgres`** database (under Databases).
2. Open **Tools → Query Tool**. The bar at the top should say `postgres/postgres@…`.
3. Click the folder icon (Open File), choose `00_create_database.sql`, then press **Execute (F5)**.
4. Right-click **Databases → Refresh**. You'll see **`porridge_factory`**.

(Or do it by clicking instead: right-click **Databases → Create → Database…**, name it `porridge_factory`, then **Save**.)

**Step 2: create the tables inside it**
1. Click **`porridge_factory`** in the tree, then **Tools → Query Tool**. Check the bar at the top says **`porridge_factory/postgres@…`**.
2. Open `01_create_schema.sql` and press **Execute (F5)**.
3. You should see `Query returned successfully`. Under **porridge_factory → Schemas → public → Tables** (right-click → Refresh) there are 19 tables.

**Step 3: connect the app**
In the project's `.env` file, set `PGDATABASE=porridge_factory`, then start the app (`npm run dev`). It asks you to **create the administrator account**.

The new database starts **empty**: no supermarkets, products or sales, and the currency is set to **UGX**. Add your regions, supermarkets, products, raw materials and people under **Setup** in the app.

## B. Upgrading from the earlier version

You only need this if `porridge_factory` already has tables from the earlier app (there's a table called `staff`).

1. **Back up first:** right-click `porridge_factory` → **Backup…** → choose a file name → **Backup**.
2. Right-click `porridge_factory` → **Query Tool** → open `02_upgrade_from_v1.sql` → **Execute (F5)**.
3. It runs as one transaction. If anything goes wrong, nothing is changed and you'll see the reason.

What happens to your records:

- **Team members** become people with the role *Regional manager*. They can't sign in until you give them a username and password (in the app: **Setup → People & access**).
- **Each shop's area** becomes a **region**. Shops with the same area share a region.
- **The person in charge of a shop** becomes the manager of that shop's region.
- **Raw material deliveries** become *material purchases*.
- **Deliveries already recorded** are marked as received in full.
- **Packs "returned" on old sales reports** become return records.
- Stock on each shelf comes out the same as before.

Running it a second time does nothing. It stops with *"already on version 2"*.

## C. What's in the database

| Table | Holds |
|---|---|
| `settings` | company name, currency, warning levels |
| `regions` | regions supermarkets are grouped into |
| `users` | people, their role, login name and password (stored as a secure hash) |
| `user_regions` | which regions each regional manager covers |
| `user_outlets` | which supermarkets each supermarket user records for |
| `sessions` | who is signed in (only a hash of each session key is kept) |
| `outlets` | supermarkets and shops, each in a region |
| `products` | porridge products, selling price to supermarkets, shelf price |
| `materials` | raw materials (description, unit, reorder level) |
| `bom_items` | recipes (Bill of Materials): material per pack of each product |
| `material_purchases` | raw materials bought: quantity, total cost, supplier |
| `batches` + `batch_materials` | production: planned vs actual packs, other costs, materials actually used |
| `dispatches` | stock sent to supermarkets: **in transit** until confirmed; packs received |
| `sales` | packs sold, price, discount, value |
| `payments` | money received from supermarkets |
| `adjustments` | returns, damage, expiry, losses, stock-count differences, raw material wastage |
| `report_submissions` | reports regional managers send to management |

**Views** (ready-made figures): `shop_stock`, `shop_balances`, `factory_stock`, `material_stock`. For example, `SELECT * FROM shop_stock;`.

## D. Looking after it

- **Backups:** right-click `porridge_factory` → **Backup…**. Do this regularly, for example weekly, and before any upgrade.
- **Restore:** create an empty database, then right-click it → **Restore…** and choose the backup file.
- **Locked out of the administrator account:** see queries 13 and 15 at the bottom of `03_useful_queries.sql`.
- **Don't edit rows by hand** unless you're sure. The app checks stock rules when saving, but direct edits in pgAdmin skip those checks.
