-- ════════════════════════════════════════════════════════════
-- INSERCIÓN INICIAL: bib_colaboradores + bib_colaboradores_correos
-- Ejecutar en Supabase Biblioteca (xmondkilgkesaqaspmfq)
-- ════════════════════════════════════════════════════════════

-- Limpiar si existiera carga previa parcial
TRUNCATE bib_colaboradores_correos RESTART IDENTITY CASCADE;
TRUNCATE bib_colaboradores RESTART IDENTITY CASCADE;

-- ── RECTORÍA ────────────────────────────────────────────────
INSERT INTO bib_colaboradores (nombre, cargo, area) VALUES
  ('Gloria Janeth Monoga',                   'Rectora',                                'Rectoría');

INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'rectoria@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Gloria Janeth Monoga';

-- ── COORDINACIONES GENERALES ─────────────────────────────────
INSERT INTO bib_colaboradores (nombre, cargo, area) VALUES
  ('Julián Fernando Vargas Hernández',        'Coordinador General de Convivencia',     'Coordinaciones Generales'),
  ('Sandra Rocío Otero Rodríguez',            'Coordinadora General Académica',         'Coordinaciones Generales'),
  ('Sandra Milena Sandoval Larrota',          'Coordinadora Académica Primaria',        'Coordinaciones Generales'),
  ('María Alexandra Cabeza Hernandez',        'Coordinadora Nivel Preescolar',          'Coordinaciones Generales'),
  ('Libiam Maritza González Mejía',           'Coordinadora Programa Misión Familia',   'Coordinaciones Generales');

INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'convivenciabachillerato@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Julián Fernando Vargas Hernández';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'academicobachillerato@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Sandra Rocío Otero Rodríguez';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'academicoprimaria@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Sandra Milena Sandoval Larrota';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'coordinacionpreescolar@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'María Alexandra Cabeza Hernandez';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'misionfamilia@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Libiam Maritza González Mejía';

-- ── ORIENTACIÓN ESCOLAR ──────────────────────────────────────
INSERT INTO bib_colaboradores (nombre, cargo, area) VALUES
  ('Claudia Maritza Rueda Gonzalez',          'Orientadora Escolar',                   'Orientación Escolar'),
  ('Mayra Alejandra Vega Gonzalez',           'Orientadora Escolar',                   'Orientación Escolar'),
  ('Jeison Ortiz Gamboa',                     'Orientador Escolar',                    'Orientación Escolar'),
  ('Angie Katherine Sanmiguel Garcia',        'Orientadora Escolar',                   'Orientación Escolar'),
  ('Aleyda Caro Rincon',                      'Enfermera',                             'Orientación Escolar');

INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'claudiam.rueda@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Claudia Maritza Rueda Gonzalez';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'psicologia@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Mayra Alejandra Vega Gonzalez';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'jeison.ortiz@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Jeison Ortiz Gamboa';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'angie.sanmiguel@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Angie Katherine Sanmiguel Garcia';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'auxprimerosauxilios@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Aleyda Caro Rincon';

-- ── MATEMÁTICAS ──────────────────────────────────────────────
INSERT INTO bib_colaboradores (nombre, cargo, area) VALUES
  ('Candy Viviana Villamizar Perez',          'Coordinadora de Área',                  'Matemáticas'),
  ('Emmi Marleibi Calderón Díaz',             'Docente',                               'Matemáticas'),
  ('Eimy Acevedo',                            'Docente',                               'Matemáticas');

INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'candy.villamizar@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Candy Viviana Villamizar Perez';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'emmi.calderon@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Emmi Marleibi Calderón Díaz';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'eimy.acevedo@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Eimy Acevedo';

-- ── LENGUAJE ────────────────────────────────────────────────
INSERT INTO bib_colaboradores (nombre, cargo, area) VALUES
  ('Jenny Maritza Ramírez Badillo',           'Coordinadora de Área',                  'Lenguaje'),
  ('Edgar Oriol Capacho Mogollon',            'Docente',                               'Lenguaje'),
  ('Sergio Alberto Jagua Zamora',             'Docente',                               'Lenguaje'),
  ('Sandra Marcela Perez Quintero',           'Docente',                               'Lenguaje'),
  ('Saray Dayanna Perez Silva',               'Docente',                               'Lenguaje');

INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'jennym.ramirez@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Jenny Maritza Ramírez Badillo';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'edgaro.capacho@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Edgar Oriol Capacho Mogollon';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'sergioa.jagua@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Sergio Alberto Jagua Zamora';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'sandram.perez@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Sandra Marcela Perez Quintero';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'saray.perez@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Saray Dayanna Perez Silva';

-- ── CIENCIAS SOCIALES ───────────────────────────────────────
INSERT INTO bib_colaboradores (nombre, cargo, area) VALUES
  ('Johan David Camargo Zuleta',              'Coordinador de Área',                   'Ciencias Sociales'),
  ('Claudia Mercedes Riveros Mendoza',        'Docente',                               'Ciencias Sociales'),
  ('Martha Lucia Contreras Torres',           'Docente',                               'Ciencias Sociales'),
  ('Maria Angelica Castro Moreno',            'Docente',                               'Ciencias Sociales');

INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'johand.camargo@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Johan David Camargo Zuleta';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'claudiam.riveros@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Claudia Mercedes Riveros Mendoza';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'marthac.torres@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Martha Lucia Contreras Torres';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'mariaa.moreno@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Maria Angelica Castro Moreno';

-- ── CIENCIAS NATURALES ──────────────────────────────────────
INSERT INTO bib_colaboradores (nombre, cargo, area) VALUES
  ('Lizeth Ofelia Ballesteros Galvis',        'Coordinadora de Área',                  'Ciencias Naturales'),
  ('Leidy Carolina Duarte Arroyo',            'Docente',                               'Ciencias Naturales'),
  ('Paula Liliana Alvarez Rengifo',           'Docente',                               'Ciencias Naturales'),
  ('Monica Andrea Celemin Sanchez',           'Docente',                               'Ciencias Naturales'),
  ('Luis Gonzalo Parra Carrillo',             'Docente',                               'Ciencias Naturales');

INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'lizetho.ballesteros@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Lizeth Ofelia Ballesteros Galvis';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'leidyc.duarte@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Leidy Carolina Duarte Arroyo';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'paula.rengifo@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Paula Liliana Alvarez Rengifo';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'monicaa.celemin@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Monica Andrea Celemin Sanchez';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'luisg.parra@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Luis Gonzalo Parra Carrillo';

-- ── INGLÉS ──────────────────────────────────────────────────
INSERT INTO bib_colaboradores (nombre, cargo, area) VALUES
  ('Frank Jarvey Acevedo Rincón',             'Coordinador de Área',                   'Inglés'),
  ('Francis Andrea Bolaños Saenz',            'Docente',                               'Inglés'),
  ('Diana Marcela Botero Carrillo',           'Docente',                               'Inglés'),
  ('Andres Felipe Carrero Silva',             'Docente',                               'Inglés'),
  ('Wilson Elías Estupiñan Mantilla',         'Docente',                               'Inglés'),
  ('Laura Lucia Figueredo Prada',             'Docente',                               'Inglés'),
  ('María Fernanda Garzon Ojeda',             'Docente',                               'Inglés'),
  ('Nicole Stephanie Romero Trillos',         'Docente',                               'Inglés'),
  ('Sandra Carolina Tello Suarez',            'Docente',                               'Inglés'),
  ('Yadira Beatriz Yepez Lucena',             'Docente',                               'Inglés');

INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'frankj.acevedo@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Frank Jarvey Acevedo Rincón';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'francisa.bolanos@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Francis Andrea Bolaños Saenz' AND area = 'Inglés';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'dianam.botero@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Diana Marcela Botero Carrillo';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'andresc.silva@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Andres Felipe Carrero Silva';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'wilsonelias12301@yahoo.com', true FROM bib_colaboradores WHERE nombre = 'Wilson Elías Estupiñan Mantilla';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'lauraf.prada@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Laura Lucia Figueredo Prada';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'mariaf.garzon@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'María Fernanda Garzon Ojeda';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'nicoles.romero@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Nicole Stephanie Romero Trillos';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'sandrac.tello@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Sandra Carolina Tello Suarez';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'yadiray.lucena@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Yadira Beatriz Yepez Lucena';

-- ── ARTES ───────────────────────────────────────────────────
INSERT INTO bib_colaboradores (nombre, cargo, area) VALUES
  ('Lina María Solano Serrano',               'Coordinadora de Área',                  'Artes'),
  ('Yolima Ortiz Torres',                     'Docente',                               'Artes'),
  ('Leidy Tatiana Quijano Fajardo',           'Docente',                               'Artes'),
  ('Diego Alfredo Villamizar Trillos',        'Docente',                               'Artes'),
  ('Daniela Cabeza Niño',                     'Docente',                               'Artes'),
  ('Ismael Estevez',                          'Auxiliar de taller',                    'Artes');

INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'linam.solano@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Lina María Solano Serrano';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'yolima.ortiz@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Yolima Ortiz Torres';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'leydit.quijano@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Leidy Tatiana Quijano Fajardo';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'diegoa.villamizar@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Diego Alfredo Villamizar Trillos';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'daniela.cabeza@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Daniela Cabeza Niño';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'ismael.estevez@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Ismael Estevez';

-- ── TECNOLOGÍA E INFORMÁTICA ────────────────────────────────
INSERT INTO bib_colaboradores (nombre, cargo, area) VALUES
  ('Leydi Estrella Arguello Gordillo',        'Docente',                               'Tecnología e Informática'),
  ('Sandra Maria Pineda',                     'Docente',                               'Tecnología e Informática');

INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'leydie.arguello@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Leydi Estrella Arguello Gordillo';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'sandra.pineda@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Sandra Maria Pineda';

-- ── EDUCACIÓN FÍSICA ────────────────────────────────────────
INSERT INTO bib_colaboradores (nombre, cargo, area) VALUES
  ('Yudi Alejandra Patiño Cubides',           'Coordinadora de Área',                  'Educación Física'),
  ('Alvaro Santiago Martinez',                'Docente',                               'Educación Física'),
  ('Sergio Mateus Gonzales',                  'Docente',                               'Educación Física'),
  ('Lidia Liseth Cala Mora',                  'Docente',                               'Educación Física');

INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'yudia.cubides@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Yudi Alejandra Patiño Cubides';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'alvaros.martinez@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Alvaro Santiago Martinez';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'sergio.m@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Sergio Mateus Gonzales';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'liseth.cala@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Lidia Liseth Cala Mora';

-- ── PREESCOLAR ──────────────────────────────────────────────
INSERT INTO bib_colaboradores (nombre, cargo, area) VALUES
  ('Laura Natalia Flórez Medrano',            'Docente',                               'Preescolar'),
  ('Daniela Barragan Gómez',                  'Docente',                               'Preescolar');

INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'laura.florez@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Laura Natalia Flórez Medrano';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'daniela.barragan@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Daniela Barragan Gómez';
-- Nota: Francis Andrea Bolaños Saenz ya está en Inglés; si también da en Preescolar
-- agregar un segundo correo o registrar como colaboradora separada según necesidad.

-- ── AUXILIAR DOCENTE ────────────────────────────────────────
INSERT INTO bib_colaboradores (nombre, cargo, area) VALUES
  ('Helga Yohanna Diaz Diaz',                 'Auxiliar Docente',                      'Auxiliar Docente');

INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'yohanna.diaz@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Helga Yohanna Diaz Diaz';

-- ── ADMINISTRATIVO ──────────────────────────────────────────
INSERT INTO bib_colaboradores (nombre, cargo, area) VALUES
  ('Evelia Mejía de González',                'Administradora General',                'Administrativo'),
  ('Marco Antonio Montaña',                   'Asesor',                                'Administrativo'),
  ('Sonia Rocío Monoga Mejía',                'Coordinadora Administrativa',           'Administrativo'),
  ('Andrea Ruiz Marín',                       'Talento Humano',                        'Administrativo'),
  ('Yuli Andrea Rodríguez',                   'Contadora',                             'Administrativo'),
  ('Genny Patricia Jaimes',                   'Secretaria Académica',                  'Administrativo'),
  ('Yaddy Zulay Pinto Vargas',                'Asistente Contable',                    'Administrativo'),
  ('Anderson David Cala Mora',                'Asistente de Diseño y Marketing',       'Administrativo'),
  ('Johana Emilce Ortiz',                     'Auxiliar Administrativo',               'Administrativo'),
  ('Yanid Sandoval Sandoval',                 'Auxiliar de SG-SST',                    'Administrativo'),
  ('Lesly Juliana Hernandez Rojas',           'Auxiliar de Cartera',                   'Administrativo'),
  ('Sandra Medina Jaimes',                    'Auxiliar Contable',                     'Administrativo'),
  ('Nazly Nayibe Castellanos',                'Auxiliar de Secretaría Académica',      'Administrativo'),
  ('Jhohan Sebastian Garcia Gomez',           'Auxiliar Logístico',                    'Administrativo'),
  ('Ludwing Harvey Saavedra Santamaria',      'Auxiliar Logístico y Tecnológico',      'Administrativo'),
  ('Jorge Luis Valencia Perez',               'Practicante Administrativo',            'Administrativo'),
  ('Irma Lucia Forero Niño',                  'Practicante',                           'Administrativo');

INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'evelia.gonzalez@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Evelia Mejía de González';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'asesorgoyavier@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Marco Antonio Montaña';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'administracion@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Sonia Rocío Monoga Mejía';

-- Andrea Ruiz Marín tiene 3 correos
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'convivencialaboral@colegiogoyavier.edu.co', true  FROM bib_colaboradores WHERE nombre = 'Andrea Ruiz Marín';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'copasst@colegiogoyavier.edu.co',            false FROM bib_colaboradores WHERE nombre = 'Andrea Ruiz Marín';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'talentohumano@colegiogoyavier.edu.co',      false FROM bib_colaboradores WHERE nombre = 'Andrea Ruiz Marín';

INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'contabilidad@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Yuli Andrea Rodríguez';

-- Genny Patricia Jaimes tiene 2 correos
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'protecciondatos@colegiogoyavier.edu.co', true  FROM bib_colaboradores WHERE nombre = 'Genny Patricia Jaimes';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'secretaria@colegiogoyavier.edu.co',      false FROM bib_colaboradores WHERE nombre = 'Genny Patricia Jaimes';

INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'asistentecontable@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Yaddy Zulay Pinto Vargas';

-- Anderson David Cala Mora tiene 2 correos
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'admisiones@colegiogoyavier.edu.co',       true  FROM bib_colaboradores WHERE nombre = 'Anderson David Cala Mora';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'asistentecreativo@colegiogoyavier.edu.co', false FROM bib_colaboradores WHERE nombre = 'Anderson David Cala Mora';

INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'serviciodealimentacion@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Johana Emilce Ortiz';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'auxiliarsgsst@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Yanid Sandoval Sandoval';

-- Lesly Juliana Hernandez Rojas tiene 2 correos
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'cartera@colegiogoyavier.edu.co',               true  FROM bib_colaboradores WHERE nombre = 'Lesly Juliana Hernandez Rojas';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'leslyj.hernandez@colegiogoyavier.edu.co',      false FROM bib_colaboradores WHERE nombre = 'Lesly Juliana Hernandez Rojas';

INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'auxiliarcontable@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Sandra Medina Jaimes';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'recepcion@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Nazly Nayibe Castellanos';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'biblioteca@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Jhohan Sebastian Garcia Gomez';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'auxiliarlogistico@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Ludwing Harvey Saavedra Santamaria';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'practicanteadmon@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Jorge Luis Valencia Perez';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'irmaf.forero@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Irma Lucia Forero Niño';

-- ── PERSONAL DE APOYO ───────────────────────────────────────
INSERT INTO bib_colaboradores (nombre, cargo, area) VALUES
  ('Gerson Danovis Acero Celis',              'Personal de apoyo',                     'Personal de Apoyo'),
  ('Cesar Cabra Laideo',                      'Personal de apoyo',                     'Personal de Apoyo'),
  ('Luz Elena Carmona Mattos',                'Personal de apoyo',                     'Personal de Apoyo'),
  ('Luz Mila Celis Caceres',                  'Personal de apoyo',                     'Personal de Apoyo'),
  ('Guillermo Gonzalez Maldonado',            'Personal de apoyo',                     'Personal de Apoyo'),
  ('Michael Santiago Gonzalez Martinez',      'Personal de apoyo',                     'Personal de Apoyo'),
  ('Eylen Hernandez Rojas',                   'Personal de apoyo',                     'Personal de Apoyo'),
  ('Ruben Yair Mejia Garcia',                 'Personal de apoyo',                     'Personal de Apoyo'),
  ('Luz Alba Murillo Pinzon',                 'Personal de apoyo',                     'Personal de Apoyo'),
  ('Claudia Patricia Peinado Ortiz',          'Personal de apoyo',                     'Personal de Apoyo'),
  ('Biany Rico Villarreal',                   'Personal de apoyo',                     'Personal de Apoyo'),
  ('Ricardo Rios Osses',                      'Personal de apoyo',                     'Personal de Apoyo'),
  ('Damaris Romero',                          'Personal de apoyo',                     'Personal de Apoyo'),
  ('Sonia Rondon Niño',                       'Personal de apoyo',                     'Personal de Apoyo'),
  ('Favio Rondon Uribe',                      'Personal de apoyo',                     'Personal de Apoyo'),
  ('Ruben Dario Tarazona Baron',              'Personal de apoyo',                     'Personal de Apoyo');

INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'acerogerson202@gmail.com', true FROM bib_colaboradores WHERE nombre = 'Gerson Danovis Acero Celis';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'cesar.cabra@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Cesar Cabra Laideo';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'luze.carmona@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Luz Elena Carmona Mattos';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'luzm.celys@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Luz Mila Celis Caceres';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'guillermo.gonzalez@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Guillermo Gonzalez Maldonado';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'michael.gonzalez@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Michael Santiago Gonzalez Martinez';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'eylen.hernandez@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Eylen Hernandez Rojas';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'ruben.mejia@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Ruben Yair Mejia Garcia';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'luza.murillo@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Luz Alba Murillo Pinzon';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'claudiap.peinado@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Claudia Patricia Peinado Ortiz';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'biany.rico@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Biany Rico Villarreal';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'ricardo.rios@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Ricardo Rios Osses';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'damaris.romero@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Damaris Romero';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'sonian.rondon@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Sonia Rondon Niño';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'favio.rondon@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Favio Rondon Uribe';
INSERT INTO bib_colaboradores_correos (colaborador_id, email, principal)
SELECT id, 'rubend.tarazona@colegiogoyavier.edu.co', true FROM bib_colaboradores WHERE nombre = 'Ruben Dario Tarazona Baron';

-- ════════════════════════════════════════════════════════════
-- Verificación rápida
SELECT COUNT(*) AS colaboradores FROM bib_colaboradores;
SELECT COUNT(*) AS correos        FROM bib_colaboradores_correos;
