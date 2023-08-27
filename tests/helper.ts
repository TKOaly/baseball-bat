import { Inject, Service } from 'typedi';
import { faker } from '@faker-js/faker';
import { PayerService } from '../backend/services/payer';
import { emailIdentity } from '../common/types';

export type CreatePayerOpts = {
  email?: string,
  firstName?: string,
  lastName?: string,
};

@Service()
export class TestHelper {
  @Inject(() => PayerService)
    payers: PayerService;

  async createPayer(opts?: CreatePayerOpts) {
    const firstName = opts?.firstName ?? faker.person.firstName();
    const lastName = opts?.lastName ?? faker.person.lastName();

    const email = opts?.email ?? faker.internet.email({ firstName, lastName });

    const details = {
      name: `${firstName} ${lastName}`,
    };

    const payer = await this.payers.createPayerProfileFromEmailIdentity(emailIdentity(email), details);

    return payer;
  }
}
