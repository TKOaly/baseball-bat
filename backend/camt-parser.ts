import { EuroValue, cents } from '../common/currency';
import { parseISO } from 'date-fns';
import * as xml2js from 'xml2js';
import xpath from 'xml2js-xpath';

export type AccountDetails = {
  iban: string
  currency: string
}

export type ServicerDetails = {
  bic: string
  name: string
  postalAddress: string
}

export type Balance = {
  date: Date
  amount: EuroValue
}

export type StatementEntry = {
  id: string
  amount: EuroValue
  type: 'debit' | 'credit'
  bookingDate: Date
  valueDate: Date
  otherParty: {
    name: string
    account?: string | null
  }
  reference?: string | null
  message?: string | null
}

export type CamtStatement = {
  id: string
  creationDateTime: Date
  account: AccountDetails
  servicer: ServicerDetails
  openingBalance: Balance
  closingBalance: Balance
  entries: StatementEntry[]
}

const parseEuroValue = (value: string): EuroValue => {
  const [euroPart, centPart] = value.split('.', 2);

  if (centPart.length !== 2) {
    throw new Error('Invalid currency value: ' + value);
  }



  return cents(parseInt(euroPart) * 100 + parseInt(centPart));
};

export const parseCamtStatement = async (content: string): Promise<CamtStatement> => {
  const doc = await xml2js.parseStringPromise(content);

  const find = (selector: string, root: any = doc) => {
    let value;

    try {
      value = xpath.find(root, selector)[0];
    } catch (e) {
      return null;
    }

    if (typeof value === 'object' && '_' in value) {
      return value._;
    } else {
      return value;
    }
  };

  const findOrThrow = (selector: string, root: any = doc): string => {
    const value = find(selector, root);

    if (!value) {
      throw new Error('Could not parse CAMT statement: Not found: ' + selector);
    }

    return value;
  };

  const balances = xpath.find(doc, '//Document/BkToCstmrAcctRpt/Rpt/Bal')
    .map((bal) => (console.log(bal), {
      type: findOrThrow('//Tp/CdOrPrtry/Cd', bal),
      amount: parseEuroValue(findOrThrow('//Amt', bal)),
      date: parseISO(findOrThrow('//Dt/Dt', bal)),
    }));

  const openingBalance = balances.find(bal => bal.type === 'OPBD');
  const closingBalance = balances.find(bal => bal.type === 'CLBD');

  if (!openingBalance || !closingBalance) {
    throw new Error('Opening or closing balance not present in the CAMT statement');
  }

  const entries: StatementEntry[] = xpath.find(doc, '//Document/BkToCstmrAcctRpt/Rpt/Ntry')
    .map((ntry) => {
      const cdtDbtInd = find('//CdtDbtInd', ntry);
      let type: 'debit' | 'credit';

      if (cdtDbtInd === 'DBIT') {
        type = 'debit';
      } else if (cdtDbtInd === 'CRDT') {
        type = 'credit';
      } else {
        throw new Error('Invalid statement entry cdtDbtInd: ' + cdtDbtInd);
      }

      return {
        id: findOrThrow('//NtryDtls/TxDtls/Refs/MsgId', ntry),
        amount: parseEuroValue(findOrThrow('//NtryDtls/TxDtls/AmtDtls/TxAmt/Amt', ntry)),
        type,
        bookingDate: parseISO(findOrThrow('//BookgDt/Dt', ntry)),
        valueDate: parseISO(findOrThrow('//ValDt/Dt', ntry)),
        otherParty: type === 'debit'
          ? {
            name: findOrThrow('//NtryDtls/TxDtls/RltdPties/Cdtr/Nm', ntry),
            account: find('//NtryDtls/TxDtls/RltdPties/CdtrAcct/Id/IBAN', ntry),
          }
          : {
            name: findOrThrow('//NtryDtls/TxDtls/RltdPties/Dbtr/Nm', ntry),
            account: find('//NtryDtls/TxDtls/RltdPties/DbtrAcct/Id/IBAN', ntry),
          },
        reference: find('//NtryDtls/TxDtls/RmtInf/Strd/CdtrRefInf/Ref', ntry),
        message: find('//NtryDtls/TxDtls/RmtInf/Ustrd', ntry),
      };
    });

  return {
    creationDateTime: parseISO(findOrThrow('//Document/BkToCstmrAcctRpt/Rpt/CreDtTm')),
    id: findOrThrow('//Document/BkToCstmrAcctRpt/Rpt/Id'),
    account: {
      iban: findOrThrow('//Document/BkToCstmrAcctRpt/Rpt/Acct/Id/IBAN'),
      currency: findOrThrow('//Document/BkToCstmrAcctRpt/Rpt/Acct/Ccy'),
    },
    servicer: {
      bic: findOrThrow('//Document/BkToCstmrAcctRpt/Rpt/Acct/Svcr/FinInstnId/BIC'),
      name: findOrThrow('//Document/BkToCstmrAcctRpt/Rpt/Acct/Svcr/FinInstnId/Nm'),
      postalAddress: findOrThrow('//Document/BkToCstmrAcctRpt/Rpt/Acct/Svcr/FinInstnId/PstlAdr/StrtNm'),
    },
    openingBalance,
    closingBalance,
    entries,
  };
};
