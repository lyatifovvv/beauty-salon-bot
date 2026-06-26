import { Composer } from 'grammy';
import { MyContext } from '../../core/session';

import { clientStartComposer } from './start';
import { clientSalonComposer } from './salon';
import { clientPortfolioComposer } from './portfolio';
import { clientBookingComposer } from './booking';
import { clientProfileComposer } from './profile';

export const clientComposer = new Composer<MyContext>();

clientComposer.use(clientStartComposer);
clientComposer.use(clientSalonComposer);
clientComposer.use(clientPortfolioComposer);
clientComposer.use(clientBookingComposer);
clientComposer.use(clientProfileComposer);
