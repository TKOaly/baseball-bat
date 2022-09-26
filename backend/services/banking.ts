import { Inject, Service } from 'typedi'
import { BankAccount } from '../../common/types'
import { PgClient } from '../db'
import sql from 'sql-template-strings'

@Service()
export class BankingService {
  @Inject(() => PgClient)
  pg: PgClient

  async createBankAccount(account: BankAccount) {
    await this.pg.any(sql`
      INSERT INTO bank_accounts (iban, name)
      VALUES (${account.iban}, ${account.name})
    `)
  }

  async getBankAccounts() {
    return this.pg.any<BankAccount>(sql`SELECT * FROM bank_accounts`)
  }
}
