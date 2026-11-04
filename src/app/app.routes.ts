import { Routes } from '@angular/router';
import { CrisisRoomComponent } from './crisis-room/crisis-room.component';
import { ReportesComponent } from './reportes/reportes.component';

export const routes: Routes = [
  {
    path: '',
    component: CrisisRoomComponent
  },
  {
    path: 'reportes',
    component: ReportesComponent
  },
  {
    path: '**',
    redirectTo: ''
  }
];
