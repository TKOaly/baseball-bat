import { useMemo } from 'react';
import { Formik } from 'formik';
import { Breadcrumbs } from '../../components/breadcrumbs';
import { useGetDebtCenterQuery, useUpdateDebtCenterMutation } from '../../api/debt-centers';
import { useLocation } from 'wouter';
import { InputGroup } from '../../components/input-group';
import { TextField } from '../../components/text-field';
import { TextareaField } from '../../components/textarea-field';
import * as A from 'fp-ts/lib/Array';
import * as O from 'fp-ts/lib/Option';
import * as TE from 'fp-ts/lib/TaskEither';
import * as E from 'fp-ts/lib/Either';
import * as S from 'fp-ts/lib/string';
import { TabularFieldListFormik } from '../../components/tabular-field-list';
import { EuroField } from '../../components/euro-field';
import { useCreateDebtComponentMutation, useDeleteDebtComponentMutation, useGetDebtComponentsByCenterQuery, useUpdateDebtComponentMutation } from '../../api/debt';
import { DebtComponent, euro, NewDebtComponent } from '../../../common/types';
import { pipe } from 'fp-ts/lib/function';
import { useDialog } from '../../components/dialog';
import { DebtCenterConfirmationDialog } from '../../components/dialogs/debt-center-edit-confirmation-dialog';
import { contramap } from 'fp-ts/lib/Eq';

type FormComponentValue = {
  name: string,
  amount: number,
  description: string,
  id: string | null
}

type FormValues = {
  name: string
  url: string
  description: string
  components: FormComponentValue[]
}

export const EditDebtCenter = ({ params }) => {
  const { id } = params;
  const { data: debtCenter } = useGetDebtCenterQuery(id);
  const { data: components } = useGetDebtComponentsByCenterQuery(id);
  const [createDebtComponent] = useCreateDebtComponentMutation();
  const [, setLocation] = useLocation();
  const [deleteDebtComponent] = useDeleteDebtComponentMutation();
  const [updateDebtComponent] = useUpdateDebtComponentMutation();
  const [updateDebtCenter] = useUpdateDebtCenterMutation();
  const showDebtCenterConfirmationDialog = useDialog(DebtCenterConfirmationDialog);

  const initialValues = useMemo(() => {
    if (!debtCenter) {
      return {
        name: '',
        url: '',
        description: '',
        components: [],
      };
    } else {
      return {
        name: debtCenter.name,
        url: debtCenter.url,
        description: debtCenter.description,
        components: !components
          ? []
          : components.map(c => ({
            id: c.id,
            name: c.name,
            amount: c.amount.value / 100,
            description: c.description,
          })),
      };
    }
  }, [debtCenter, components]);

  const handleSubmit = async (values: FormValues) => {
    const result = await updateDebtCenter({
      id,
      name: values.name,
      description: values.description,
      url: values.url,
    });

    const newComponents = pipe(
      values.components,
      A.filter((c) => c.id === null),
    );

    const IdEq = contramap((c: { id: string, name: string }) => c.id)(S.Eq);

    const removedComponents = pipe(
      components,
      A.difference(IdEq)(pipe(
        values.components,
        A.filter((c) => c.id !== null),
      )),
    );

    const changedComponents = pipe(
      components,
      A.intersection(IdEq)(values.components),
      A.filterMap(({ id }) => {
        const existing = components.find(c => c.id === id);
        const modified = values.components.find(c => c.id === id);

        if (existing.name !== modified.name || existing.amount.value / 100 !== modified.amount) {
          return O.some([existing, modified] as [DebtComponent, FormComponentValue]);
        } else {
          return O.none;
        }
      }),
    )

    if (removedComponents.length > 0 || newComponents.length > 0 || changedComponents.length > 0) {
      const confirmed = await showDebtCenterConfirmationDialog({
        remove: removedComponents.map(c => c.name),
        create: newComponents.map(c => c.name),
        change: changedComponents.map(([existing]) => existing.name),
      });

      if (!confirmed) {
        return;
      }

      const deleteDebtComponentTask = (debtComponentId: string) => async () => {
        const result = await deleteDebtComponent({
          debtCenterId: id,
          debtComponentId,
        });

        if ('data' in result) {
          return E.right(result.data);
        } else {
          return E.left(result.error);
        }
      };

      const createDebtComponentTask = (newComponent: NewDebtComponent) => async () => {
        const result = await createDebtComponent(newComponent);

        if ('data' in result) {
          return E.right(result.data);
        } else {
          return E.left(result.error);
        }
      };

      const updateDebtComponentTask = (existing: DebtComponent, updated: FormComponentValue) => async () => {
        const result = await updateDebtComponent({
          debtCenterId: id,
          debtComponentId: existing.id,
          values: {
            name: existing.name !== updated.name ? updated.name : undefined,
            amount: existing.amount.value / 100 !== updated.amount ? euro(updated.amount) : undefined,
          },
        });

        if ('data' in result) {
          return E.right(result.data);
        } else {
          return E.left(result.error);
        }
      };

      if (removedComponents.length > 0) {
        const result = await pipe(
          removedComponents,
          A.map((c) => c.id),
          A.traverse(TE.ApplicativePar)(deleteDebtComponentTask),
        )();

        if ('error' in result) {
          return;
        }
      }

      if (newComponents.length > 0) {
        const result = await pipe(
          newComponents,
          A.map((c) => ({ ...c, debtCenterId: id, amount: euro(c.amount) })),
          A.traverse(TE.ApplicativePar)(createDebtComponentTask),
        )();

        if ('error' in result) {
          return;
        }
      }

      if (changedComponents.length > 0) {
        const result = await pipe(
          changedComponents,
          A.traverse(TE.ApplicativePar)(([existing, updated]) => updateDebtComponentTask(existing, updated)),
        )();

        if ('error' in result) {
          return;
        }
      }
    }

    if ('data' in result) {
      setLocation(`/admin/debt-centers/${id}`);
    }
  };

  return (
    <div>
      <h1 className="text-2xl mb-5 mt-10">
        <Breadcrumbs
          segments={[
            { text: 'Debt Center', url: '/admin' },
            { text: debtCenter?.name ?? id, url: `/admin/debt-centers/${id}` },
            'Edit',
          ]}
        />
      </h1>
      <p className="text-gray-800 mb-7 text-md"></p>
      <Formik
        enableReinitialize
        initialValues={initialValues}
        validate={(values) => {
          const errors: Record<string, string> = {};

          if (values.name.length < 3) {
            errors.name = 'Name must be longer than 3 characters.';
          }

          /*const componentNames = new Set();

          values.components.forEach((component, i) => {
            if (componentNames.has(component.name)) {
              errors[`components.${i}.name`] = 'Duplicate component name.'
            }

            componentNames.add(component.name)
          });*/

          return errors;
        }}
        onSubmit={handleSubmit}
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
              createNew={() => ({ name: '', amount: 0, description: '', id: null })}
            />
            <div className="col-span-full flex items-center justify-end gap-3 mt-2">
              <button className="bg-gray-100 hover:bg-gray-200 active:ring-2 shadow-sm rounded-md py-1.5 px-3 text-gray-500 font-bold">Cancel</button>
              <button className="bg-blue-500 disabled:bg-gray-400 hover:bg-blue-600 active:ring-2 shadow-sm rounded-md py-1.5 px-3 text-white font-bold" onClick={submitForm} disabled={isSubmitting}>Save</button>
            </div>
          </div>
        )}
      </Formik>
    </div>
  );
};
