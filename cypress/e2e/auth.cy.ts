describe('empty spec', () => {
  // before(() => cy.resetDatabase({ hard: true }));
  beforeEach(() => cy.resetDatabase());

  it('should be possible to login using an admin account', () => {
    cy.visit('/');
    cy.get('[data-cy="login-member-account-button"]').click();
    cy.get('input#username').type('admin');
    cy.get('input#password').type('admin');
    cy.get('form#loginForm').submit();
    cy.get('[name=accept][type=submit]').click();
    cy.get('[name=accept][type=submit]').click();
    cy.contains('h3', 'Hi, Essi Esimerkki Esimerkki!').should('exist');
  });

  it('should be not possible to login using a non-admin account', () => {
    cy.visit('/');
    cy.get('[data-cy="login-member-account-button"]').click();
    cy.get('input#username').type('jasen');
    cy.get('input#password').type('jasen');
    cy.get('form#loginForm').submit();
    cy.get('[name=accept][type=submit]').click();
    cy.get('[name=accept][type=submit]').click();
    cy.contains('h3', 'Hi, ').should('not.exist');
  });

  it('should be possible to access the administration dashboard using an admin account', () => {
    cy.visit('/');
    cy.get('[data-cy="login-member-account-button"]').click();
    cy.get('input#username').type('admin');
    cy.get('input#password').type('admin');
    cy.get('form#loginForm').submit();
    cy.get('[name=accept][type=submit]').click();
    cy.get('[name=accept][type=submit]').click();
    cy.visit('/admin');
    cy.contains('h1', 'Debt Centers').should('exist');
  });
});
