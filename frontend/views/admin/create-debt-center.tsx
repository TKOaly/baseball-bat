import { PropsWithChildren, createContext, InputHTMLAttributes } from "react";
import { ChevronsRight } from "react-feather"
import { Formik, FormikErrors, useField } from "formik"
import { Breadcrumbs } from '../../components/breadcrumbs'
import { useCreateDebtCenterMutation } from "../../api/debt-centers";
import { useLocation } from "wouter";
import { InputGroup } from '../../components/input-group'
import { TextField } from '../../components/text-field'
import { TextareaField } from '../../components/textarea-field'
import { TabularFieldListFormik } from "../../components/tabular-field-list";
import { EuroField } from "../../components/euro-field";
import { DropdownField } from "../../components/dropdown-field";
import { useCreateDebtComponentMutation } from "../../api/debt";
import { euro } from "../../../common/types";

type FormValues = {
  name: string
  url: string
  description: string
  components: { name: string, amount: number, description: string }[]
}

export const CreateDebtCenter = () => {
  const [createDebtCenter, { isLoading }] = useCreateDebtCenterMutation()
  const [createDebtComponent] = useCreateDebtComponentMutation()
  const [, setLocation] = useLocation()

  return (
    <div>
      <h1 className="text-2xl mb-5 mt-10">
        <Breadcrumbs segments={[{ text: 'Debt Center', url: '/admin' }, 'Create']} />
      </h1>
      <p className="text-gray-800 mb-7 text-md"></p>
      <Formik
        initialValues={{
          name: '',
          url: '',
          description: '',
          components: [],
        } as FormValues}
        validate={(values) => {
          const errors: Record<string, string> = {};

          if (values.name.length < 3) {
            errors.name = 'Name must be longer than 3 characters.'
          }

          const componentNames = new Set();

          values.components.forEach((component, i) => {
            if (componentNames.has(component.name)) {
              errors[`components.${i}.name`] = 'Duplicate component name.'
            }

            componentNames.add(component.name)
          });

          console.log(errors);

          return errors;
        }}
        onSubmit={async (values, { setFieldError }) => {
          const res = await createDebtCenter(values);

          if (!('data' in res && res.data)) {
            setFieldError((res as any).error.data.field, (res as any).error.data.message);
            return
          }

          const createComponents = values.components
            .map(async (component, i) => {
              const componentRes = await createDebtComponent({
                ...component,
                amount: euro(component.amount * 100),
                debtCenterId: res.data.id,
              });

              if ('data' in componentRes) {
                return componentRes.data.id;
              } else {
                setFieldError(`components.${i}.name`, 'Failed to create component.')
                throw new Error();
              }
            })

          try {
            await Promise.all(createComponents)
            setLocation(`/admin/debt-centers/${res.data.id}`);
          } finally { }
        }}
      >
        {({ submitForm, isSubmitting }) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <div className="col-span-full border-b mb-4 pb-2 uppercase text-xs font-bold text-gray-400 px-1">
              Basic Information
            </div>
            <p className="col-span-full text-sm mb-2">
              Lorem ipsum dolor sit amet.
            </p>
            <InputGroup label='Name' name="name" component={TextField} />
            <InputGroup label='URL' name="url" component={TextField} />
            <InputGroup label='Description' name="description" fullWidth component={TextareaField} />
            <InputGroup
              label="Components"
              name="components"
              fullWidth
              component={TabularFieldListFormik}
              columns={[
                {
                  key: 'name',
                  header: 'Name',
                  component: TextField,
                },
                {
                  key: 'amount',
                  header: 'Amount',
                  component: EuroField,
                },
                {
                  key: 'description',
                  component: TextField,
                  header: 'Description',
                },
              ]}
              createNew={() => ({ name: '', amount: 0, description: '' })}
            />
            <div className="col-span-full flex items-center justify-end gap-3 mt-2">
              <button className="bg-gray-100 hover:bg-gray-200 active:ring-2 shadow-sm rounded-md py-1.5 px-3 text-gray-500 font-bold">Cancel</button>
              <button className="bg-blue-500 disabled:bg-gray-400 hover:bg-blue-600 active:ring-2 shadow-sm rounded-md py-1.5 px-3 text-white font-bold" onClick={submitForm} disabled={isSubmitting}>Create</button>
            </div>
          </div>
        )}
      </Formik>
    </div>
  );
};
