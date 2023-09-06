/// <reference types="cypress" />
// ***********************************************
// This example commands.ts shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })
//

declare namespace Cypress {
  interface Chainable {
    resetDatabase(opts?: { hard?: boolean }): Chainable<void>;
    login(opts: { username: string; password: string }): Chainable<void>;
    getResourceField(label: string): Chainable<Element>;
    getResourceSection(title: string): Chainable<Element>;
  }
}

Cypress.Commands.add(
  'resetDatabase',
  ({ hard = false }: { hard?: boolean } = {}) => {
    cy.log(`Performing ${hard ? 'hard' : 'soft'} database reset...`);
    cy.exec(
      `cd ../tko-aly.fi && ./reset.sh ${hard === true ? 'hard' : 'soft'}`,
      { log: false },
    );
  },
);

Cypress.Commands.add('login', ({ username, password }) => {
  cy.intercept('/api/auth/authenticate').as('authenticate');
  cy.visit('/');
  cy.get('[data-cy="login-member-account-button"]').click();
  cy.get('input#username').type(username);
  cy.get('input#password').type(password);
  cy.get('form#loginForm').submit();
  cy.get('[name=accept][type=submit]').click();
  cy.get('[name=accept][type=submit]').click();
  cy.wait('@authenticate');
});

Cypress.Commands.add(
  'getResourceSection',
  { prevSubject: 'optional' },
  (subject, title) => {
    const selector = `[data-cy="resource-section"][data-cy-title="${title}"] [data-cy="resource-section-content"]`;

    if (subject) {
      return cy.wrap(subject).find(selector);
    } else {
      return cy.get(selector);
    }
  },
);

Cypress.Commands.add(
  'getResourceField',
  { prevSubject: 'optional' },
  (subject, label) => {
    const selector = `[data-cy=resource-field][data-cy-label="${label}"] [data-cy="resource-field-content"]`;

    if (subject) {
      return cy.wrap(subject).find(selector);
    } else {
      return cy.get(selector);
    }
  },
);
