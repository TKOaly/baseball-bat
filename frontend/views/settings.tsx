import React from 'react'
import { Formik } from 'formik'
import { DropdownField } from '../components/dropdown-field'
import { TabularFieldListFormik } from '../components/tabular-field-list'
import { TextField } from '../components/text-field'
import { InputGroup } from '../components/input-group'

export const Settings = () => {
  return (
    <div>
      <h3 className="text-xl text-gray-500 font-bold">Käyttäjäasetukset</h3>
      <Formik
        initialValues={{
          uiLanguage: 'en',
          emailLanguage: 'en',
          emails: [
            { priority: 'primary', email: 'asd@asd.com' },
          ],
        }}
        onSubmit={() => { }}
      >
        {({ submitForm, isSubmitting }) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <InputGroup
              component={DropdownField}
              name="uiLanguage"
              label="Käyttöliittymän kieli"
              options={[
                { value: 'en', text: 'English' },
                { value: 'fi', text: 'Suomi' },
              ]}
            />
            <InputGroup
              component={DropdownField}
              name="emailLanguage"
              label="Sähköpostien kieli"
              options={[
                { value: 'en', text: 'English' },
                { value: 'fi', text: 'Suomi' },
              ]}
            />
            <InputGroup
              label="Sähköpostiosoitteet"
              fullWidth
              name="emails"
              component={TabularFieldListFormik}
              createNew={() => ({ email: '', priority: 'secondary' })}
              columns={[
                {
                  header: 'Osoite',
                  component: TextField,
                  key: 'email',
                },
                {
                  header: 'Prioriteetti',
                  component: DropdownField,
                  key: 'priority',
                  props: {
                    options: [
                      { value: 'primary', text: 'Ensisijainen' },
                      { value: 'secondary', text: 'Toissijainen' },
                      { value: 'disabled', text: 'Ei käytössä' },
                    ],
                  },
                },
              ]}
            />
            <div className="col-span-full flex items-center justify-end gap-3 mt-2">
              <button className="bg-gray-100 hover:bg-gray-200 active:ring-2 shadow-sm rounded-md py-1.5 px-3 text-gray-500 font-bold">Peruuta</button>
              <button className="bg-blue-500 disabled:bg-gray-400 hover:bg-blue-600 active:ring-2 shadow-sm rounded-md py-1.5 px-3 text-white font-bold" onClick={submitForm} disabled={isSubmitting}>Tallenna</button>
            </div>
          </div>
        )}
      </Formik>
    </div>
  )
}
