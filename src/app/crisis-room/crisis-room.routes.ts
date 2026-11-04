import { Routes } from '@angular/router';
import { CrisisRoomComponent } from './crisis-room.component';
import { ReportesComponent } from '../reportes/reportes.component';

export const CRISIS_ROUTES: Routes = [
  {
    path: '',
    component: CrisisRoomComponent
  },
  {
    path: 'reportes',
    component: ReportesComponent
  }
];
