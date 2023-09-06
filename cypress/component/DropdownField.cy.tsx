import { DropdownField } from '../../frontend/components/dropdown-field';
import { Formik } from 'formik';
import React from 'react';

describe('DropdownField.cy.ts', () => {
  it('playground', () => {
    cy.mount(
      <Formik>
        {() => (
          <DropdownField options={[]} onChange={() => {}} name="dropdown" />
        )}
      </Formik>,
    );
  });
});
