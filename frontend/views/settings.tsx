import React from 'react'
import { Formik } from 'formik'
import { Session } from '../../common/types'
import { DropdownField } from '../components/dropdown-field'
import { TabularFieldListFormik } from '../components/tabular-field-list'
import { TextField } from '../components/text-field'
import { InputGroup } from '../components/input-group'
import { useGetPayerEmailsQuery, useUpdatePayerEmailsMutation, useUpdatePayerPreferencesMutation } from '../api/payers'

export const Settings = ({ session }: { session: Session }) => {
  const [updatePreferences] = useUpdatePayerPreferencesMutation()
  const [updatePayerEmails] = useUpdatePayerEmailsMutation()
  const { data, isLoading } = useGetPayerEmailsQuery(session.payerId, { skip: !session.payerId })

  return (
    <div>
      <h3 className="text-xl text-gray-500 font-bold">Käyttäjäasetukset</h3>
      <Formik
        enableReinitialize
        initialValues={{
          ...session.preferences,
          emails: data ?? [],
        }}
        onSubmit={async (values) => {
          await updatePreferences({
            payerId: 'me',
            preferences: {
              uiLanguage: values.uiLanguage,
              emailLanguage: values.emailLanguage,
            },
          })

          await updatePayerEmails({
            payerId: 'me',
            emails: values.emails,
          })
        }}
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
                      { value: 'default', text: 'Toissijainen' },
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
