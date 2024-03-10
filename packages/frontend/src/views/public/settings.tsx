import { Formik } from 'formik';
import { DropdownField } from '@bbat/ui/dropdown-field';
import { TabularFieldListFormik } from '../../components/tabular-field-list';
import { TextField } from '@bbat/ui/text-field';
import { InputGroup } from '../../components/input-group';
import { useTranslation } from 'react-i18next';
import {
  useGetPayerEmailsQuery,
  useUpdatePayerEmailsMutation,
  useUpdatePayerPreferencesMutation,
} from '../../api/payers';
import { useAppSelector } from '../../store';
import { skipToken } from '@reduxjs/toolkit/query';

export const Settings = () => {
  const { t } = useTranslation([], { keyPrefix: 'settings' });
  const [updatePreferences] = useUpdatePayerPreferencesMutation();
  const [updatePayerEmails] = useUpdatePayerEmailsMutation();
  const session = useAppSelector(state => state.session);
  const { data } = useGetPayerEmailsQuery(session.data?.userId ?? skipToken);

  return (
    <div className="rounded-md bg-white/90 p-8 shadow-xl">
      <h3 className="mb-8 font-bold text-zinc-800">
        {t('userSettingsHeader')}
      </h3>
      <Formik
        enableReinitialize
        initialValues={{
          ...session.data?.preferences,
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
        {({ values, submitForm, isSubmitting }) => (
          <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
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
              createNew={() => ({
                key: `new-${values.emails.length}`,
                email: '',
                priority: 'secondary',
              })}
              value={values.emails.map(email => ({
                ...email,
                key: email.email,
              }))}
              columns={[
                {
                  header: t('emailHeader'),
                  component: TextField,
                  key: 'email' as any,
                },
                {
                  header: t('emailPriorityHeader'),
                  component: DropdownField,
                  key: 'priority' as any,
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
            <div className="col-span-full mt-2 flex items-center justify-end gap-3">
              <button className="rounded-md bg-gray-100 px-3 py-1.5 font-bold text-gray-500 shadow-sm hover:bg-gray-200 active:ring-2">
                {t('cancel')}
              </button>
              <button
                className="rounded-md bg-blue-500 px-3 py-1.5 font-bold text-white shadow-sm hover:bg-blue-600 active:ring-2 disabled:bg-gray-400"
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
