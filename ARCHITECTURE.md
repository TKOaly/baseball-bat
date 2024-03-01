# Architecture

This documents describes the high-level architecture of *baseball-bat*
(henceforth *BBat*). Reading this document should give you a general
understanding of what is going on in the codebase and where different
functionality lies. 

## Bird's eye view

BBat is a web application, which is used by [TKO-äly ry](https://tko-aly.fi/)
to manage it's membership's debts, send e-mail invoices and keep track of
payments received against these debts. Debts are added to the system manually
via a simple CRUD-stlye UI, by importing them from a CSV file or directly
from the organization's event registration system. Received payments are
imported using an electronic CAMT.052 (XML) bank statement.

The application consists of the front-office and the back-office.

### Front-Office

Front-office is accessible by everyone who has debt's in the system. Users authenticate by using their email, to which
an authentication code is sent, or if they are a member of the organization,
the organization's SSO service. In the front-office users can view their
outstanding and resolved debts, including their payment information. Support
for online payments using Stripe is planned.

### Back-Office

In the back-office, officers of the organization can create debts, track
payments, compile reports for inclusion in the annual financial statement,
log cash payments and manually register bank transactions to their
corresponding debts. Currently the back-office is only accessible by those
holding the organization-wide admin priviliges. This includes the IT
administration team and most notably the treasurer and the assisting
treasurers.

## Code map

The code in this repository is organized in a monorepo-style layout. The
`packages/` directory contains the packages from which the application is
built. The packages are referenced in the code using a `@bbat/*` prefix.

### Packages

 - `@bbat/common` <br />
   This package contains code shared between the frontend and the backend. Type definitions constitute the majority of code in this package.
 - `@bbat/ui` <br />
   This package contains UI components used by the frontend, as well as Storybooks for them. Majority of the UI code is still in `@bbat/frontend`, but commonly used and sufficiently generic compnents should be lifted here.
 - `@bbat/backend` <br />
   This package contains the backend server implementation, database migrations, and other asset files, such as email and report templates.
 - `@bbat/frontend` <br />
   This package contains the frontend implementation of both the back-office and the front-office.

### Backend architecture

The backend aspires to be a modular monolith, consisting of modules which communicate by using a RPC-style application bus.
The modules are contained in separate directories under `packages/backend/src/modules/`.
Each module's directory usually contains the following files:

 - `index.ts`: Contains the definition of the module, including the implementations of the RPC procedures.
 - `api.ts`: Implementations of the REST API endpoints exposed by the module.
 - `definitions.ts`: Definitions of RPC interfaces exposed by the module.

#### The Bus

Communication between modules is done by using a central application bus.
Modules can define interfaces, which consist of a set of procedures, that can then be implemented by the same module itself or any other modules.
These implementations can be named or unnamed. Most of the interfaces are designed to have a single implementation, while others are expected to have multiple implementations identified by their name.

For example, the `payments` module defines an interface called `paymentType`, which consists of a single procedure `createPayment`.
This interface has named implementations provided by the modules `invoice`, `stripe` and `payments` itself, named `invoice`, `stripe` and `cash` respectively.
When a payment of type `stripe` is created the `payment` module executes the `createPayment` procedure of the `paymentType` interface implementation named `stripe`.
Having multiple named implementations allows essentially for dynamic dispatch between modules.

#### Modules

 -  **accounting** <br />
    This module manages accounting periods, which have very limited role in the application as of now.
    Their role in the future undecided.

 - **banking** <br />
    Banking contains functionality related to managing bank accounts, bank statements and consuming CAMT.052 bank statements.

 - **debt-centers** <br />
This module contains basic CRUD operations of debt centers, which are collections of debts, usually corresponding to a single event.

 - **debts** <br />
This module is reponsible for managing debts (creation, deletion, publishing, crediting, editing) and the creation of payments from those debts.

 - **email** <br />
This module renders, queues, and sends emails.

 - **events** <br />
This module consumes the `events-microservice` API.

 - **invoices** <br />
This module manages payments of type `invoice`, which correspond to e-mail invoices sent to the debtors.
The module reacts to events emitted by the `banking` module and keeps track of payments made with the invoice's reference number.

 - **jobs** <br />
This module provides an asynchronous job queue for the other modules as well as an REST API for listing jobs and their statuses.
Reports are generated and emails are sent using the job queue.

 - **payers** <br />
This module is responsible for the user information, and pulling user information from the member registry using the `users` module.

 - **payments** <br />
This module is responsible for keeping track of payments and their balances.
It reveives payment events from other modules and updates the payment's balances and statuses accordingly.
Other modules, especially the `debts` module, can react to payments' status changes by subscribing to events emitted by this module. <br /><br />
The `payments` module offloads the implementation details of individual payment methods and types to other modules (`invoice` and `stripe`).
The only payment type it itself implements is the `cash` payment type, which contains no payment type specific logic.

 - **reports** <br />
This renders PDF reports using a headless chromium browser. Other modules can implement report types, which can be rendered using this module.

 - **search** <br />
This module exposes a REST API for full-text search. All of the heavy lifting of the search is performed by the underlying Postgres database.

 - **stripe** <br />
This module implements the `stripe` payment type. Upon payment creation it creates a payment intent with Stripe and listens to payment events from Stripe using a webhook.

 - **users** <br />
This module consumes the `user-service` REST API and is used by the `profiles` module when creating new payer profiles for the organization's members.
