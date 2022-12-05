describe('Debts', () => {
  beforeEach(() => cy.resetDatabase());

  context('Creation', () => {
    it('should be possible to create a valid debt', () => {
      cy.login({
        username: 'admin',
        password: 'admin',
      });

      cy.visit('/admin/debts/create');

      cy.get('input[name=name]').type('Testi');
      cy.contains('span', 'Center').parent().find('input').type('Testi');
      cy.contains('span', 'Center').parent().contains('li', 'Create').click();
      cy.contains('span', 'Payer').parent().find('input').type('Esimerkki');
      cy.contains('span', 'Payer').parent().contains('li', 'Essi Esimerkki').click();
      cy.contains('button', 'Create').click();
      cy.location().its('pathname').should('match', /\/admin\/debts\/[a-f0-9-]+/);

      cy.getResourceSection('Details').as('details');
      cy.get('@details').getResourceField('Published at').should('contain', 'Not published');
    });

    it('should not be possible to specify both a payment condition and a due date', () => {
      cy.login({
        username: 'admin',
        password: 'admin',
      });

      cy.visit('/admin/debts/create');

      cy.intercept('post', '/api/debt').as('createDebt');

      cy.get('input[name=name]').type('Testi');
      cy.contains('span', 'Center').parent().find('input').type('Testi');
      cy.contains('span', 'Center').parent().contains('li', 'Create').click();
      cy.contains('span', 'Payer').parent().find('input').type('Esimerkki');
      cy.contains('span', 'Payer').parent().contains('li', 'Essi Esimerkki').click();
      cy.contains('span', 'Payment Condition').parent().find('input').clear().type('1234');
      cy.contains('span', 'Due Date').parent().find('input').type('01.01.2023');
      cy.contains('span', 'Payment Condition').parent().find('input').should('have.value', '');
      cy.contains('button', 'Create').click();
      cy.location().its('pathname').should('match', /\/admin\/debts\/[a-f0-9-]+/);
      cy.getResourceSection('Details').as('details');
      cy.get('@details').getResourceField('Published at').should('contain', 'Not published');
      cy.get('@details').getResourceField('Due Date').should('contain', '01.01.2023');
      cy.get('@details').getResourceField('Payment Condition').should('not.exist');

      cy.wait('@createDebt').its('request.body.paymentCondition').should('eq', '');
    });

    it('created debt should have a total amount equal to the sum of it\'s components', () => {
      cy.login({
        username: 'admin',
        password: 'admin',
      });

      cy.visit('/admin/debts/create');

      cy.intercept('post', '/api/debt').as('createDebt');

      cy.get('input[name=name]').type('Testi');
      cy.contains('span', 'Center').parent().find('input').type('Testi');
      cy.contains('span', 'Center').parent().contains('li', 'Create').click();
      cy.contains('span', 'Payer').parent().find('input').type('Esimerkki');
      cy.contains('span', 'Payer').parent().contains('li', 'Essi Esimerkki').click();
      cy.get('[data-cy="tabular-field-list-add-button"]').click();
      cy.get('[data-row=0][data-column="component"] input').type('Component A');
      cy.get('[data-row=0][data-column="component"]').contains('Create "Component A"').click();
      cy.get('[data-row=0][data-column="amount"] input').clear().type('10');
      cy.get('[data-cy="tabular-field-list-add-button"]').click();
      cy.get('[data-row=1][data-column="component"] input').type('Component B');
      cy.get('[data-row=1][data-column="component"]').contains('Create "Component B"').click();
      cy.get('[data-row=1][data-column="amount"] input').clear().type('5');
      cy.contains('button', 'Create').click();
      cy.contains('div', 'Total').parent().should('contain', '15,00');
    });

    it('unpublished debt should initially have no payments', () => {
      cy.login({
        username: 'admin',
        password: 'admin',
      });

      cy.visit('/admin/debts/create');

      cy.intercept('post', '/api/debt').as('createDebt');

      cy.get('input[name=name]').type('Testi');
      cy.contains('span', 'Center').parent().find('input').type('Testi');
      cy.contains('span', 'Center').parent().contains('li', 'Create').click();
      cy.contains('span', 'Payer').parent().find('input').type('Esimerkki');
      cy.contains('span', 'Payer').parent().contains('li', 'Essi Esimerkki').click();
      cy.get('[data-cy="tabular-field-list-add-button"]').click();
      cy.get('[data-row=0][data-column="component"] input').type('Component A');
      cy.get('[data-row=0][data-column="component"]').contains('Create "Component A"').click();
      cy.get('[data-row=0][data-column="amount"] input').clear().type('10');
      cy.contains('button', 'Create').click();
      cy.contains('div', 'Payments').parent().parent().find('[data-cy=table-view]').invoke('attr', 'data-total-rows').should('eq', '0');
    });

    it('other payments should be marked as credited when one payment is realised', () => {
      cy.login({
        username: 'admin',
        password: 'admin',
      });

      cy.visit('/admin/debts/create');

      cy.intercept('post', '/api/debt').as('createDebt');

      cy.get('input[name=name]').type('Testi');
      cy.contains('span', 'Center').parent().find('input').type('Testi');
      cy.contains('span', 'Center').parent().contains('li', 'Create').click();
      cy.contains('span', 'Payer').parent().find('input').type('Esimerkki');
      cy.contains('span', 'Payer').parent().contains('li', 'Essi Esimerkki').click();
      cy.get('[data-cy="tabular-field-list-add-button"]').click();
      cy.get('[data-row=0][data-column="component"] input').type('Component A');
      cy.get('[data-row=0][data-column="component"]').contains('Create "Component A"').click();
      cy.get('[data-row=0][data-column="amount"] input').clear().type('10');
      cy.contains('button', 'Create').click();
      cy.contains('button', 'Publish').click();
      cy.contains('button', 'Mark paid with cash').click();
      cy.getResourceSection('Payments').contains('[data-cy=table-view] [data-column=Status]', 'Credited').should('exist');
      cy.getResourceSection('Details').getResourceField('Status').should('contain', 'Paid');
    });
  });

  context('Publishing', () => {
    it('should be possible to publish an unpublished debt', () => {
      cy.login({
        username: 'admin',
        password: 'admin',
      });

      cy.visit('/admin/debts/create');

      cy.intercept('post', '/api/debt').as('createDebt');

      cy.get('input[name=name]').type('Testi');
      cy.contains('span', 'Center').parent().find('input').type('Testi');
      cy.contains('span', 'Center').parent().contains('li', 'Create').click();
      cy.contains('span', 'Payer').parent().find('input').type('Esimerkki');
      cy.contains('span', 'Payer').parent().contains('li', 'Essi Esimerkki').click();
      cy.get('[data-cy="tabular-field-list-add-button"]').click();
      cy.get('[data-row=0][data-column="component"] input').type('Component A');
      cy.get('[data-row=0][data-column="component"]').contains('Create "Component A"').click();
      cy.get('[data-row=0][data-column="amount"] input').clear().type('10');
      cy.contains('button', 'Create').click();
      cy.getResourceField('Status').should('contain', 'Draft');
      cy.contains('button', 'Publish').click();
      cy.getResourceField('Status').should('contain', 'Unpaid');
    });

    it('should not be possible to publish an already published debt', () => {
      cy.login({
        username: 'admin',
        password: 'admin',
      });

      cy.visit('/admin/debts/create');

      cy.intercept('post', '/api/debt').as('createDebt');

      cy.get('input[name=name]').type('Testi');
      cy.contains('span', 'Center').parent().find('input').type('Testi');
      cy.contains('span', 'Center').parent().contains('li', 'Create').click();
      cy.contains('span', 'Payer').parent().find('input').type('Esimerkki');
      cy.contains('span', 'Payer').parent().contains('li', 'Essi Esimerkki').click();
      cy.get('[data-cy="tabular-field-list-add-button"]').click();
      cy.get('[data-row=0][data-column="component"] input').type('Component A');
      cy.get('[data-row=0][data-column="component"]').contains('Create "Component A"').click();
      cy.get('[data-row=0][data-column="amount"] input').clear().type('10');
      cy.contains('button', 'Create').click();
      cy.contains('button', 'Publish').click();
      cy.getResourceField('Status').should('contain', 'Unpaid');
      cy.contains('button', 'Publish').should('not.exist');
    });

    context('Invoice creation', () => {
      it('publishing a debt should result in an invoice being created', () => {
        cy.login({
          username: 'admin',
          password: 'admin',
        });

        cy.visit('/admin/debts/create');

        cy.intercept('post', '/api/debt').as('createDebt');

        cy.get('input[name=name]').type('Testi');
        cy.contains('span', 'Center').parent().find('input').type('Testi');
        cy.contains('span', 'Center').parent().contains('li', 'Create').click();
        cy.contains('span', 'Payer').parent().find('input').type('Esimerkki');
        cy.contains('span', 'Payer').parent().contains('li', 'Essi Esimerkki').click();
        cy.get('[data-cy="tabular-field-list-add-button"]').click();
        cy.get('[data-row=0][data-column="component"] input').type('Component A');
        cy.get('[data-row=0][data-column="component"]').contains('Create "Component A"').click();
        cy.get('[data-row=0][data-column="amount"] input').clear().type('10');
        cy.contains('button', 'Create').click();
        cy.contains('div', 'Payments').parent().parent().find('[data-cy=table-view]').invoke('attr', 'data-total-rows').should('eq', '0');
        cy.contains('button', 'Publish').click();
        cy.contains('div', 'Payments').parent().parent().find('[data-cy=table-view]').invoke('attr', 'data-total-rows').should('eq', '1');
      });

      it('the created invoice should have correct due date when it is explicitly specified', () => {});

      it('the created invoice should have correct due date when it is calculated from a payment condition', () => {});
    });
  });

  context('Crediting', () => {
    it('should be possible to credit published debts', () => {
      cy.login({
        username: 'admin',
        password: 'admin',
      });

      cy.visit('/admin/debts/create');

      cy.intercept('post', '/api/debt').as('createDebt');

      cy.get('input[name=name]').type('Testi');
      cy.contains('span', 'Center').parent().find('input').type('Testi');
      cy.contains('span', 'Center').parent().contains('li', 'Create').click();
      cy.contains('span', 'Payer').parent().find('input').type('Esimerkki');
      cy.contains('span', 'Payer').parent().contains('li', 'Essi Esimerkki').click();
      cy.get('[data-cy="tabular-field-list-add-button"]').click();
      cy.get('[data-row=0][data-column="component"] input').type('Component A');
      cy.get('[data-row=0][data-column="component"]').contains('Create "Component A"').click();
      cy.get('[data-row=0][data-column="amount"] input').clear().type('10');
      cy.contains('button', 'Create').click();
      cy.contains('button', 'Publish').click();
      cy.contains('button', 'Credit').click();
      cy.getResourceField('Status').should('contain', 'Credited');
    });

    it('should not be possible to credit unpublished debts', () => {
      cy.login({
        username: 'admin',
        password: 'admin',
      });

      cy.visit('/admin/debts/create');

      cy.intercept('post', '/api/debt').as('createDebt');

      cy.get('input[name=name]').type('Testi');
      cy.contains('span', 'Center').parent().find('input').type('Testi');
      cy.contains('span', 'Center').parent().contains('li', 'Create').click();
      cy.contains('span', 'Payer').parent().find('input').type('Esimerkki');
      cy.contains('span', 'Payer').parent().contains('li', 'Essi Esimerkki').click();
      cy.get('[data-cy="tabular-field-list-add-button"]').click();
      cy.get('[data-row=0][data-column="component"] input').type('Component A');
      cy.get('[data-row=0][data-column="component"]').contains('Create "Component A"').click();
      cy.get('[data-row=0][data-column="amount"] input').clear().type('10');
      cy.contains('button', 'Create').click();
      cy.contains('button', 'Publish').should('not.exist');
    });
  });

  context('Editing', () => {
    it('should be possible to edit unpublished debts', () => {
      cy.login({
        username: 'admin',
        password: 'admin',
      });

      cy.visit('/admin/debts/create');

      cy.intercept('post', '/api/debt').as('createDebt');

      cy.get('input[name=name]').type('Testi');
      cy.contains('span', 'Center').parent().find('input').type('Testi');
      cy.contains('span', 'Center').parent().contains('li', 'Create').click();
      cy.contains('span', 'Payer').parent().find('input').type('Esimerkki');
      cy.contains('span', 'Payer').parent().contains('li', 'Essi Esimerkki').click();
      cy.get('[data-cy="tabular-field-list-add-button"]').click();
      cy.get('[data-row=0][data-column="component"] input').type('Component A');
      cy.get('[data-row=0][data-column="component"]').contains('Create "Component A"').click();
      cy.get('[data-row=0][data-column="amount"] input').clear().type('10');
      cy.contains('button', 'Create').click();
      cy.getResourceSection('Details').as('details');
      cy.get('@details').getResourceField('Name').should('contain', 'Testi');
      cy.get('@details').getResourceField('Payer').should('contain', 'Essi Esimerkki Esimerkki');
      cy.get('@details').getResourceField('Collection').should('contain', 'Testi');
      cy.get('@details').getResourceField('Total').should('contain', '10,00');
      cy.get('@details').getResourceField('Payment Condition').should('contain', '14 days');
      cy.get('@details').getResourceField('Status').should('contain', 'Draft');
      cy.getResourceSection('Content').as('content');
      cy.get('@content').find('[data-row=0][data-column=name]').should('contain', 'Component A');
      cy.get('@content').find('[data-row=1]').should('not.exist');
      cy.contains('button', 'Edit').click();
      cy.get('input[name=name]').clear().type('Muokattu nimi');
      cy.contains('span', 'Center').parent().find('input').clear().type('Toinen kokoelma');
      cy.contains('span', 'Center').parent().contains('li', 'Create').click();
      //cy.contains('span', 'Payer').parent().find('input').clear().type('Janne');
      //cy.contains('span', 'Payer').parent().contains('li', 'Janne Jäsen').click();
      cy.contains('span', 'Payment Condition').parent().find('input').clear().type('31');
      cy.get('[data-cy="tabular-field-list-add-button"]').click();
      cy.get('[data-row=1][data-column="component"] input').type('Component B');
      cy.get('[data-row=1][data-column="component"]').contains('Create "Component B"').click();
      cy.get('[data-row=1][data-column="amount"] input').clear().type('5');
      cy.contains('button', 'Save').click();
      cy.get('[data-cy="edit-resource-creation-confirmation-dialog"]').contains('button', 'Continue').click();
      cy.getResourceSection('Details').as('details');
      cy.get('@details').getResourceField('Name').should('contain', 'Muokattu nimi');
      // cy.get('@details').getResourceField('Payer').should('contain', 'Janne Jäsen');
      cy.get('@details').getResourceField('Collection').should('contain', 'Toinen kokoelma');
      cy.get('@details').getResourceField('Total').should('contain', '15,00');
      cy.get('@details').getResourceField('Payment Condition').should('contain', '31 days');
      cy.get('@details').getResourceField('Status').should('contain', 'Draft');
      cy.getResourceSection('Content').as('content');
      cy.get('@content')
        .find('[data-column=name]')
        .then((columns) => {
          const names = columns.map((i, c) => Cypress.$(c).text()).toArray();

          expect(names).to.contain('Component A');
          expect(names).to.contain('Component B');
        });
    });

    it('should show a warning when editing a published debt', () => {
      cy.login({
        username: 'admin',
        password: 'admin',
      });

      cy.visit('/admin/debts/create');

      cy.intercept('post', '/api/debt').as('createDebt');

      cy.get('input[name=name]').type('Testi');
      cy.contains('span', 'Center').parent().find('input').type('Testi');
      cy.contains('span', 'Center').parent().contains('li', 'Create').click();
      cy.contains('span', 'Payer').parent().find('input').type('Esimerkki');
      cy.contains('span', 'Payer').parent().contains('li', 'Essi Esimerkki').click();
      cy.get('[data-cy="tabular-field-list-add-button"]').click();
      cy.get('[data-row=0][data-column="component"] input').type('Component A');
      cy.get('[data-row=0][data-column="component"]').contains('Create "Component A"').click();
      cy.get('[data-row=0][data-column="amount"] input').clear().type('10');
      cy.contains('button', 'Create').click();
      cy.contains('button', 'Publish').click();
      cy.contains('button', 'Edit').click();
      cy.get('[data-cy="published-debt-edit-confirmation-dialog"]').should('exist');
    });
  });

  context('Deletion', () => {
    it('should not be possible to delete published debts', () => {
      cy.login({
        username: 'admin',
        password: 'admin',
      });

      cy.visit('/admin/debts/create');

      cy.intercept('post', '/api/debt').as('createDebt');

      cy.get('input[name=name]').type('Testi');
      cy.contains('span', 'Center').parent().find('input').type('Testi');
      cy.contains('span', 'Center').parent().contains('li', 'Create').click();
      cy.contains('span', 'Payer').parent().find('input').type('Esimerkki');
      cy.contains('span', 'Payer').parent().contains('li', 'Essi Esimerkki').click();
      cy.get('[data-cy="tabular-field-list-add-button"]').click();
      cy.get('[data-row=0][data-column="component"] input').type('Component A');
      cy.get('[data-row=0][data-column="component"]').contains('Create "Component A"').click();
      cy.get('[data-row=0][data-column="amount"] input').clear().type('10');
      cy.contains('button', 'Create').click();
      cy.contains('button', 'Publish').click();
      cy.contains('button', 'Delete').should('not.exist');
    });

    it('should be possible to delete unpublished debts', () => {
      cy.login({
        username: 'admin',
        password: 'admin',
      });

      cy.visit('/admin/debts/create');

      cy.intercept('post', '/api/debt').as('createDebt');

      cy.get('input[name=name]').type('Testi');
      cy.contains('span', 'Center').parent().find('input').type('Testi');
      cy.contains('span', 'Center').parent().contains('li', 'Create').click();
      cy.contains('span', 'Payer').parent().find('input').type('Esimerkki');
      cy.contains('span', 'Payer').parent().contains('li', 'Essi Esimerkki').click();
      cy.get('[data-cy="tabular-field-list-add-button"]').click();
      cy.get('[data-row=0][data-column="component"] input').type('Component A');
      cy.get('[data-row=0][data-column="component"]').contains('Create "Component A"').click();
      cy.get('[data-row=0][data-column="amount"] input').clear().type('10');
      cy.contains('button', 'Create').click();
      cy.contains('button', 'Delete').should('exist');
      cy.url().then((url) => {
        cy.visit('/admin/debts');
        cy.get('[data-cy=table-view]').invoke('attr', 'data-total-rows').should('eq', '1');
        cy.visit(url);
        cy.contains('button', 'Delete').click();
        cy.visit('/admin/debts');
        cy.get('[data-cy=table-view]').invoke('attr', 'data-total-rows').should('eq', '0');
      });
    });
  });

  context('CSV Import', () => {
    it('should be possible to import debts using CSV', () => {
      cy.login({
        username: 'admin',
        password: 'admin',
      });

      cy.visit('/admin/debts/create-debts-csv');

      let csv = 'Name;Email;Debt Center;Title;Description;Amount;Date;Due Date;Reference Number;Payment Number{enter}';
      csv += ['Maija Maksaja', 'maija@example.com', 'Testi', 'Testi', 'Testi', 10, '01.01.2022', '01.01.2023', '12345', '1234'].map((value) => `"${value}"`).join(';');

      cy.get('textarea').type(csv, { delay: 0 });
      cy.contains('button', 'Create debts').click();
      cy.visit('/admin/debts');
      cy.get('[data-cy=table-view]').invoke('attr', 'data-total-rows').should('eq', '1');
      cy.get('[data-cy=table-view] [data-column=Name]').click();
      cy.getResourceField('Name').should('contain', 'Testi');
      cy.getResourceField('Payer').should('contain', 'Maija Maksaja');
      cy.getResourceField('Collection').should('contain', 'Testi');
      cy.getResourceField('Due Date').should('contain', '01.01.2023');
      cy.getResourceField('Published at').should('contain', '01.01.2022');
      cy.getResourceField('Status').should('contain', 'Unpaid');
      cy.getResourceField('Payer').find('a').click();
      cy.getResourceField('Emails').should('contain', 'maija@example.com');
    });

    it('should be possible to import debts using CSV', () => {
      cy.login({
        username: 'admin',
        password: 'admin',
      });

      cy.visit('/admin/debts/create-debts-csv');

      let csv = 'Name;Email;Debt Center;Title;Description;Amount;Due Date;Reference Number;Payment Number{enter}';
      csv += ['Maija Maksaja', 'maija@example.com', 'Testi', 'Testi', 'Testi', 10, '01.01.2023', '12345', '1234'].map((value) => `"${value}"`).join(';');

      cy.get('textarea').type(csv, { delay: 0 });
      cy.contains('button', 'Create debts').click();
      cy.visit('/admin/debts');
      cy.get('[data-cy=table-view]').invoke('attr', 'data-total-rows').should('eq', '1');
      cy.get('[data-cy=table-view] [data-column=Name]').click();
      cy.getResourceField('Name').should('contain', 'Testi');
      cy.getResourceField('Payer').should('contain', 'Maija Maksaja');
      cy.getResourceField('Collection').should('contain', 'Testi');
      cy.getResourceField('Due Date').should('contain', '01.01.2023');
      cy.getResourceField('Status').should('contain', 'Draft');
      cy.getResourceField('Payer').find('a').click();
      cy.getResourceField('Emails').should('contain', 'maija@example.com');
    });
  });
})
