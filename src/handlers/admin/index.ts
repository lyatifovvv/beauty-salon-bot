import { Composer } from 'grammy';
import { MyContext } from '../../core/session';

import { adminAuthComposer } from './auth';
import { adminSalonComposer } from './salon';
import { adminServicesComposer } from './services';
import { adminMastersComposer } from './masters';
import { adminClientsComposer } from './clients';
import { adminAppointmentsComposer } from './appointments';
import { adminPortfolioComposer } from './portfolio';

export const adminComposer = new Composer<MyContext>();

adminComposer.use(adminAuthComposer);
adminComposer.use(adminSalonComposer);
adminComposer.use(adminServicesComposer);
adminComposer.use(adminMastersComposer);
adminComposer.use(adminClientsComposer);
adminComposer.use(adminAppointmentsComposer);
adminComposer.use(adminPortfolioComposer);
