import { format, parseISO } from "date-fns";
import { useLocation } from "wouter";
import { useGetReportsQuery } from "../../api/report";
import { Button } from "../../components/button";
import { TableView } from "../../components/table-view";

export const ReportsListing = () => {
  const { data: reports } = useGetReportsQuery();
  const [, setLocation] = useLocation();

  return (
    <>
      <h1 className="text-2xl mt-10 mb-5">Reports</h1>

      <TableView
        rows={(reports ?? []).map((r) => ({ ...r, key: r.id }))}
        columns={[
          {
            name: 'Name',
            getValue: 'name',
          },
          {
            name: 'Generated at',
            getValue: 'generatedAt',
            render: (generatedAt) => format(parseISO(generatedAt), 'dd.MM.yyyy HH:mm'),
          },
          {
            name: '',
            getValue: (report) => report,
            render: (report) => (
              <div className="flex gap-3">
                <Button
                  small
                  onClick={() => {
                    window.open(`/api/reports/${report.id}/content`, '_blank');
                  }}
                >
                  View
                </Button>
              </div>
            ),
          }
        ]}
      />
    </>
  );
};
