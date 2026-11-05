import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'mfe1_comandos_frontend';

  ngOnInit(): void {
    const modoOperacion = environment.useMocks
      ? '[MOCK LOCAL ACTIVO (useMocks: true)]'
      : '[PRODUCCION REAL (useMocks: false)]';

    const estilo = environment.useMocks
      ? 'color: #F59E0B; font-weight: bold; font-family: monospace; font-size: 11px;'
      : 'color: #10B981; font-weight: bold; font-family: monospace; font-size: 11px;';

    console.log(
      `%c=======================================================\n` +
      `SISTEMA BOMBEROS SANTA CRUZ - MFE1 COMANDOS (:4201)\n` +
      `Modo de Operacion: ${modoOperacion}\n` +
      `API MS-01 Comandos: ${environment.apiMs1Url}\n` +
      `API MS-05 IA Core: ${environment.apiMs5Url}\n` +
      `WS Sala de Crisis: ${environment.wsSalaCrisisUrl}\n` +
      `=======================================================`,
      estilo
    );
  }
}

