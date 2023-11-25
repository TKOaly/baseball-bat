import React from 'react';
import { Formik } from 'formik';
import { DropdownField } from '../components/dropdown-field';
import { TabularFieldListFormik } from '../components/tabular-field-list';
import { TextField } from '../components/text-field';
import { InputGroup } from '../components/input-group';
import { useTranslation } from 'react-i18next';
import {
  useGetPayerEmailsQuery,
  useUpdatePayerEmailsMutation,
  useUpdatePayerPreferencesMutation,
} from '../api/payers';
import { useAppSelector } from '../store';

export const Settings = () => {
  const { t } = useTranslation([], { keyPrefix: 'settings' });
  const [updatePreferences] = useUpdatePayerPreferencesMutation();
  const [updatePayerEmails] = useUpdatePayerEmailsMutation();
  const session = useAppSelector(state => state.session);
  const { data } = useGetPayerEmailsQuery(session.payerId, {
    skip: !session.payerId,
  });

  return (
    <div>
      <h3 className="text-xl text-gray-500 font-bold">
        {t('userSettingsHeader')}
      </h3>
      <Formik
        enableReinitialize
        initialValues={{
          ...session.preferences,
          emails: data ?? [],
        }}
        onSubmit={async values => {
          await updatePreferences({
            payerId: 'me',
            preferences: {
              uiLanguage: values.uiLanguage,
              emailLanguage: values.emailLanguage,
            },
          });

          await updatePayerEmails({
            payerId: 'me',
            emails: values.emails,
          });
        }}
      >
        {({ submitForm, isSubmitting }) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <InputGroup
              component={DropdownField}
              name="uiLanguage"
              label={t('uiLanguageLabel')}
              options={[
                { value: 'en', text: 'English' },
                { value: 'fi', text: 'Suomi' },
              ]}
            />
            <InputGroup
              component={DropdownField}
              name="emailLanguage"
              label={t('emailLanguageLabel')}
              options={[
                { value: 'en', text: t('english') },
                { value: 'fi', text: t('finnish') },
              ]}
            />
            <InputGroup
              label={t('emailsLabel')}
              fullWidth
              name="emails"
              component={TabularFieldListFormik}
              createNew={() => ({ email: '', priority: 'secondary' })}
              columns={[
                {
                  header: t('emailHeader'),
                  component: TextField,
                  key: 'email',
                },
                {
                  header: t('emailPriorityHeader'),
                  component: DropdownField,
                  key: 'priority',
                  props: {
                    options: [
                      { value: 'primary', text: t('emailPriority.primary') },
                      { value: 'default', text: t('emailPriority.default') },
                      { value: 'disabled', text: t('emailPriority.disabled') },
                    ],
                  },
                },
              ]}
            />
            <div className="col-span-full flex items-center justify-end gap-3 mt-2">
              <button className="bg-gray-100 hover:bg-gray-200 active:ring-2 shadow-sm rounded-md py-1.5 px-3 text-gray-500 font-bold">
                {t('cancel')}
              </button>
              <button
                className="bg-blue-500 disabled:bg-gray-400 hover:bg-blue-600 active:ring-2 shadow-sm rounded-md py-1.5 px-3 text-white font-bold"
                onClick={submitForm}
                disabled={isSubmitting}
              >
                {t('save')}
              </button>
            </div>
          </div>
        )}
      </Formik>
    </div>
  );
};
