# Porridge Factory: Inventory, Sales & Manufacturing Management

A system for a porridge factory. It tracks raw materials and production, recipes and cost per pack, stock sent to supermarkets and confirmed on arrival, sales, payments, returns and losses, and reports for supermarkets, regions and top management.

```
React app (browser)  ──►  Node / Express API (server/)  ──►  PostgreSQL (you manage it in pgAdmin)
   src/                    sign-in, roles, stock rules         tables created from the separate
                                                               database files (01_create_schema.sql)
```

The **database files are separate** from this project (`01_create_schema.sql`, `02_upgrade_from_v1.sql`, `03_useful_queries.sql`, `DATABASE_SETUP.md`). Follow `DATABASE_SETUP.md` first.

---

## Getting started

1. **Database:** create `porridge_factory` in pgAdmin and run `01_create_schema.sql` (or `02_upgrade_from_v1.sql` if you used the earlier version). See `DATABASE_SETUP.md`.
2. **Connection:** copy `.env.example` to `.env` and fill in your PostgreSQL password.
   ```bash
   copy .env.example .env      # Windows
   cp .env.example .env        # Mac / Linux
   ```
3. **Run:**
   ```bash
   npm install
   npm run dev
   ```
   Open **http://localhost:5173**.
4. **First sign-in:** the app asks you to create the **administrator account**. Then go to **Setup** and add regions, supermarkets, products and people.

The app opens in **light mode**. To switch, click your name (bottom left) → **Appearance: Light / Dark / Device**. Amounts are in **UGX**; you can change the currency under **Setup → Company & data**.

### Running it for the whole team

```bash
npm run build
npm start            # app and API together on port 4000
```

Others on the same network open `http://<this computer's IP>:4000`. You may need to allow port 4000 through the Windows firewall. If you put it on the internet, use HTTPS: sign-in cookies are marked secure automatically behind HTTPS.

---

## Who sees what

Everyone signs in with their own username and password. The **server** enforces these rules, not just the screens.

| Role | Sees | Can record |
|---|---|---|
| **Administrator** | everything | everything, plus people, regions, supermarkets, products, settings |
| **Top management** | everything, all reports and submitted regional reports | nothing (view only) |
| **Regional manager** | only the supermarkets in their regions | confirm deliveries, sales, payments, returns & losses, stock counts; **submit regional reports** |
| **Supermarket user** | only their own supermarket | confirm deliveries, sales, returns & losses, stock counts |
| **Factory / inventory manager** | all supermarkets and factory stock | send stock out, factory damage/loss, confirm deliveries |
| **Production manager** | production only | raw material purchases, wastage, recipes, production batches |
| **Finance** | everything | payments |

Anyone can delete a record **they** made (for example, to fix a typo). Administrators can delete any record.

## What the system does (from the project document)

**Phase one: inventory, distribution and revenue**
- Finished packs in the factory, **in transit**, and on each supermarket's shelf.
- **Dispatched ≠ received ≠ sold.** A delivery stays *in transit* until the supermarket confirms how many arrived. Any shortfall is a recorded discrepancy, and only received packs count as the supermarket's stock.
- Returns, damage, expiry and losses at supermarkets and the factory.
- **Stock counts:** enter what's on the shelf, and the system records any difference from the records.
- Supermarkets grouped by **region**; regional managers assigned to regions.
- Sales with price and **discounts**, **payments received** and **what's still owed**.
- **Reports** for any period at three levels (whole business → region → supermarket): opening stock, received, sold, returned, damaged/lost, count differences, closing stock, sales value, discounts, paid and outstanding. Download as CSV. Regional managers **submit** reports with comments, and management sees them under Reports.

**Phase two: manufacturing and raw materials**
- Raw materials with description, unit, purchases (quantity, total cost, supplier and contact), use, **wastage**, on hand, and **average cost per unit**.
- **Recipes (Bill of Materials):** material per pack, cost per ingredient per pack, total material cost per pack, and selling price minus materials.
- **Production batches:** planned vs actual packs (output %), materials actually used (pre-filled from the recipe), other batch costs (labour, energy…), **cost per pack, actual vs expected**.
- Raw material stock goes down and factory stock goes up automatically.

**Not yet (phase three):** end-to-end expenses (transport, storage, retail handling) and profit per product, supermarket and region. The database is laid out so these can be added later.

---

## Pages

| Page | For |
|---|---|
| Overview | the stock flow, sales per day, "needs attention" list (deliveries to confirm, low stock, unpaid balances, low materials), latest activity. A supermarket user sees their shop and quick buttons. |
| Supermarkets | every supermarket grouped by region, with stock, sales, what's owed and status. Click one for its full detail and actions. |
| Deliveries | send stock; confirm arrivals; see what's in transit and what arrived short |
| Sales & payments | sales, payments, balances owed, returns & losses |
| Production | batches, raw materials, recipes & costs |
| Reports | period reports at business, region and supermarket level; submitted regional reports |
| History | every entry, grouped by day, week or month, with filters |
| Setup | people & access, regions, products, company settings, backups |

## Project layout

```
server/
  index.js      starts the API, error messages, serves the built app
  auth.js       sign-in, sessions, password changes
  access.js     roles: who may do what, and which supermarkets each person sees
  data.js       reading and saving records, stock rules
  tables.js     app field names ↔ database columns
  db.js         PostgreSQL connection, checks the database version
src/
  state/        auth.jsx (sign-in screens), store.jsx (records), ui.jsx (period, drawer, toasts)
  lib/          calc.js (live figures), report.js (period reports), costing.js (recipes & batch costs),
                roles.js, history.js, sample.js, api.js, format.js
  pages/        one file per page
  forms/        EntryForms.jsx (day-to-day), SetupForms.jsx (setup, people, recipes, reports)
  components/   layout, tables, chart, drawer, form parts
```

## Troubleshooting

| You see | Fix |
|---|---|
| "The database has no tables yet" | Run `01_create_schema.sql` in pgAdmin (see `DATABASE_SETUP.md`). |
| "The database is still on version 1" | Run `02_upgrade_from_v1.sql` in pgAdmin. |
| "can't connect to the PostgreSQL database" | Start PostgreSQL (Windows: Services → postgresql-x64-…). Check `PGHOST` / `PGPORT` in `.env`. |
| "rejected the username or password" | Fix `PGUSER` / `PGPASSWORD` in `.env`, then restart `npm run dev`. |
| "Can't reach the server" | The API isn't running. Run `npm run dev` and keep that window open. |
| Someone forgot their password | An administrator opens them under **Setup → People & access** and sets a new one. |

## Backups

**Setup → Company & data → Back up now** saves a full copy of every record, including people's accounts, as a file in the `backups` folder inside the project. A backup is also made automatically once a day while the app is in use. The newest 60 are kept.

Each backup in the list has **Restore**, which puts every record back as it was at that time. Before restoring, the app saves a copy of the current records, called "Before a restore", so a restore can always be undone. Everyone is signed out after a restore and signs in again with the passwords from that time.

The download icon saves a copy of a backup file. Keep one somewhere else (a USB stick or Google Drive) so you still have it if this computer is lost. To store backups in a different folder, set `BACKUP_DIR=` in `.env`.
