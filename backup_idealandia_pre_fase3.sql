-- MySQL dump 10.13  Distrib 8.0.41, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: idealandia_dev
-- ------------------------------------------------------
-- Server version	8.0.41

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `acceso_permisos`
--

DROP TABLE IF EXISTS `acceso_permisos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `acceso_permisos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `acceso_id` int NOT NULL,
  `permiso_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_acceso_permiso` (`acceso_id`,`permiso_id`),
  KEY `idx_acceso_permisos_permiso` (`permiso_id`)
) ENGINE=InnoDB AUTO_INCREMENT=50 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `acceso_permisos`
--

LOCK TABLES `acceso_permisos` WRITE;
/*!40000 ALTER TABLE `acceso_permisos` DISABLE KEYS */;
INSERT INTO `acceso_permisos` VALUES (17,13,33,'2026-11-09 23:30:51'),(18,13,43,'2026-11-09 23:30:51'),(19,13,28,'2026-11-09 23:30:51'),(20,13,38,'2026-11-09 23:30:51'),(25,14,2,'2026-11-10 01:46:19'),(26,14,4,'2026-11-10 01:46:19'),(27,14,1,'2026-11-10 01:46:19'),(28,14,3,'2026-11-10 01:46:19'),(46,15,1003,'2026-11-16 04:03:14'),(47,15,1000,'2026-11-16 04:03:14'),(48,15,65,'2026-11-16 04:03:14'),(49,15,15,'2026-11-16 04:03:14');
/*!40000 ALTER TABLE `acceso_permisos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `configuracion`
--

DROP TABLE IF EXISTS `configuracion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `configuracion` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `clave` varchar(150) NOT NULL,
  `valor` text,
  `tipo` varchar(30) NOT NULL DEFAULT 'texto',
  `descripcion` varchar(255) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `fecha_actualizacion` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `actualizado_por` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_configuracion_clave` (`clave`),
  KEY `fk_configuracion_usuario` (`actualizado_por`),
  CONSTRAINT `fk_configuracion_usuario` FOREIGN KEY (`actualizado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `configuracion`
--

LOCK TABLES `configuracion` WRITE;
/*!40000 ALTER TABLE `configuracion` DISABLE KEYS */;
INSERT INTO `configuracion` VALUES (1,'sitio.nombre','Idealandia','texto','Nombre de la plataforma',1,'2026-10-07 17:23:00',NULL),(2,'sitio.activo','1','boolean','Indica si Idealandia está activa',1,'2026-10-07 17:23:00',NULL),(3,'registro.publico','1','boolean','Permite que nuevos usuarios se registren',1,'2026-10-07 17:23:00',NULL),(4,'idealita.activa','1','boolean','Activa o desactiva Idealita',1,'2026-10-07 17:23:00',NULL),(5,'ideas.permitir_creacion','1','boolean','Permite la creación de ideas',1,'2026-10-07 17:23:00',NULL);
/*!40000 ALTER TABLE `configuracion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `conversaciones`
--

DROP TABLE IF EXISTS `conversaciones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conversaciones` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` bigint unsigned NOT NULL,
  `titulo` varchar(200) DEFAULT NULL,
  `fecha` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_conversaciones_usuario` (`usuario_id`),
  CONSTRAINT `fk_conversaciones_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `conversaciones`
--

LOCK TABLES `conversaciones` WRITE;
/*!40000 ALTER TABLE `conversaciones` DISABLE KEYS */;
/*!40000 ALTER TABLE `conversaciones` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `funcionalidad_permisos`
--

DROP TABLE IF EXISTS `funcionalidad_permisos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `funcionalidad_permisos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `funcionalidad_id` bigint unsigned NOT NULL,
  `permiso_id` bigint unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_funcionalidad_permiso` (`funcionalidad_id`,`permiso_id`),
  KEY `fk_func_perm_permiso` (`permiso_id`),
  CONSTRAINT `fk_func_perm_funcionalidad` FOREIGN KEY (`funcionalidad_id`) REFERENCES `funcionalidades` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_func_perm_permiso` FOREIGN KEY (`permiso_id`) REFERENCES `permisos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=125 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `funcionalidad_permisos`
--

LOCK TABLES `funcionalidad_permisos` WRITE;
/*!40000 ALTER TABLE `funcionalidad_permisos` DISABLE KEYS */;
INSERT INTO `funcionalidad_permisos` VALUES (3,2,1),(1,2,2),(4,2,3),(2,2,4),(10,3,5),(8,3,6),(11,3,7),(9,3,8),(100,8,10),(101,8,11),(102,8,12),(103,8,13),(104,8,14),(105,8,15),(106,8,16),(107,8,17),(108,8,18),(109,8,19),(110,8,22),(111,8,60),(112,8,61),(113,8,62),(114,8,63),(115,8,64),(116,8,65),(117,8,66),(118,8,67),(119,8,68),(120,8,69),(121,8,1000),(122,8,1001),(123,8,1002),(124,8,1003),(26,9,31),(24,9,36),(27,9,41),(25,9,46),(19,10,23),(17,10,24),(20,10,25),(18,10,26),(30,11,30),(28,11,35),(31,11,40),(29,11,45),(34,12,29),(32,12,34),(35,12,39),(33,12,44),(38,13,28),(36,13,33),(39,13,38),(37,13,43),(42,14,27),(40,14,32),(43,14,37),(41,14,42);
/*!40000 ALTER TABLE `funcionalidad_permisos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `funcionalidades`
--

DROP TABLE IF EXISTS `funcionalidades`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `funcionalidades` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `codigo` varchar(100) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `ruta` varchar(255) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `fecha_creacion` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_funcionalidades_codigo` (`codigo`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `funcionalidades`
--

LOCK TABLES `funcionalidades` WRITE;
/*!40000 ALTER TABLE `funcionalidades` DISABLE KEYS */;
INSERT INTO `funcionalidades` VALUES (1,'inicio','Inicio','Página principal de Idealandia','/',1,'2026-10-07 17:22:59'),(2,'ideas','Ideas','Gestión de ideas','/ideas',1,'2026-10-07 17:22:59'),(3,'creaciones','Creaciones','Gestión de creaciones','/creaciones',1,'2026-10-07 17:22:59'),(4,'gratis','Gratis','Contenido y servicios gratuitos','/gratis',1,'2026-10-07 17:22:59'),(6,'idealita','Idealita','Asistente virtual de Idealandia','/idealita',1,'2026-10-07 17:22:59'),(8,'administracion','Administración','Administración de Idealandia','/admin',1,'2026-10-07 17:22:59'),(9,'asesorias_financieras','Asesorías Financieras','Servicios de asesoría financiera','/servicios/asesorias-financieras',1,'2026-10-07 18:25:17'),(10,'asesoria_pensiones','Asesoría de Pensiones','Servicios de asesoría de pensiones','/servicios/asesoria-pensiones',1,'2026-10-07 18:25:17'),(11,'ideas_innovadoras','Ideas Innovadoras','Desarrollo y exploración de ideas innovadoras','/servicios/ideas-innovadoras',1,'2026-10-07 18:25:17'),(12,'emprendimientos','Emprendimientos','Servicios relacionados con emprendimientos','/servicios/emprendimientos',1,'2026-10-07 18:25:17'),(13,'clases_ingles','Clases de Inglés','Servicios de clases de inglés','/servicios/clases-ingles',1,'2026-10-07 18:25:17'),(14,'perfilamiento','Perfilamiento','Servicios de perfilamiento','/servicios/perfilamiento',1,'2026-10-07 18:25:17'),(15,'recursos_gratis','Recursos Gratis','Recursos gratuitos de Idealandia','/recursos-gratis',1,'2026-10-07 18:25:17'),(16,'contactanos','Contáctanos','Información y contacto','/contactanos',1,'2026-10-07 18:25:17');
/*!40000 ALTER TABLE `funcionalidades` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `historial_solicitudes_asociado`
--

DROP TABLE IF EXISTS `historial_solicitudes_asociado`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `historial_solicitudes_asociado` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `solicitud_id` bigint unsigned NOT NULL,
  `estatus_anterior` varchar(50) DEFAULT NULL,
  `estatus_nuevo` varchar(50) NOT NULL,
  `observaciones` text,
  `usuario_id` bigint unsigned DEFAULT NULL,
  `fecha` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_historial_usuario` (`usuario_id`),
  KEY `idx_historial_solicitud` (`solicitud_id`),
  CONSTRAINT `fk_historial_solicitud` FOREIGN KEY (`solicitud_id`) REFERENCES `solicitudes_asociado` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_historial_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=173 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `historial_solicitudes_asociado`
--

LOCK TABLES `historial_solicitudes_asociado` WRITE;
/*!40000 ALTER TABLE `historial_solicitudes_asociado` DISABLE KEYS */;
INSERT INTO `historial_solicitudes_asociado` VALUES (138,55,NULL,'por_aprobar','Registro inicial como Asociado',1082,'2026-11-15 19:23:52'),(139,55,'por_aprobar','por_aprobar','Correo electrónico validado exitosamente por el candidato',1082,'2026-11-15 19:24:18'),(140,55,'por_aprobar','mas_informacion','Fuiste muy escueto puedes abundar mas en tu información por favor',2,'2026-11-15 19:25:59'),(141,55,'mas_informacion','por_aprobar','El candidato actualizó la información requerida',NULL,'2026-11-15 19:27:03'),(142,55,'por_aprobar','mas_informacion','De acuerdo danos una referencia con nombre y numero',2,'2026-11-15 19:28:04'),(143,55,'mas_informacion','por_aprobar','El candidato actualizó la información requerida',NULL,'2026-11-15 19:29:03'),(144,55,'por_aprobar','autorizado','Solicitud autorizada por el administrador',2,'2026-11-15 19:30:55'),(145,56,NULL,'por_aprobar','Registro inicial como Asociado',1083,'2026-11-15 19:54:43'),(146,56,'por_aprobar','por_aprobar','Correo electrónico validado exitosamente por el candidato',1083,'2026-11-15 19:55:10'),(171,56,'por_aprobar','mas_informacion','Mandame mas detalle',1082,'2026-11-15 21:58:56'),(172,56,'mas_informacion','por_aprobar','El candidato actualizó la información requerida',NULL,'2026-11-15 21:59:22');
/*!40000 ALTER TABLE `historial_solicitudes_asociado` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ideas`
--

DROP TABLE IF EXISTS `ideas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ideas` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` bigint unsigned NOT NULL,
  `titulo` varchar(200) NOT NULL,
  `descripcion` text,
  `estado` varchar(50) NOT NULL DEFAULT 'pendiente',
  `fecha` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ideas_usuario` (`usuario_id`),
  KEY `idx_ideas_estado` (`estado`),
  CONSTRAINT `fk_ideas_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1030 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ideas`
--

LOCK TABLES `ideas` WRITE;
/*!40000 ALTER TABLE `ideas` DISABLE KEYS */;
INSERT INTO `ideas` VALUES (2,2,'Libro QUE HARIAS SI!','Crear un libro con categorias de situaciones donde cada situacion describa que hacer para salir de tal situación','pendiente','2026-09-30 20:49:09'),(3,2,'Venta de servicios de orientación','Crear un portafolio de servicios que incluyan categorías pero que tenga prácticamente de todo','en progreso','2026-09-30 21:06:25'),(4,2,'Idealandia','Crear un espacio sitio y aplicación donde se puedan guardar ideas para ponerlas en acción y/o compartirlas paravutilidad de otros','pendiente','2026-10-02 01:48:49'),(1017,7,'Desarrollar nuevas funcionalidades para Idealandia','Evaluar nuevas ideas y mejoras para ampliar las funcionalidades de la plataforma.','pendiente','2026-10-28 10:51:33'),(1020,7,'Otra','Arturito soy yo el que esta logueado veamos si lo ve idealita','pendiente','2026-10-30 22:53:11'),(1023,7,'Miartur','Mi primer artur','pendiente','2026-11-08 20:40:08'),(1024,7,'MiaArtur','Probar que realmente se puede guardar','pendiente','2026-11-09 12:52:47'),(1025,1005,'Mitata','AHORA SI PODRE GUARDAR MI IDEAS','pendiente','2026-11-09 12:55:29'),(1029,1007,'MianuevaMariana','Esta es una idea pensada primero en ser una prueba pero despues se convertira en todo un hito ya que a partir de aqui podremos crear nuevas ideas para compartir y disfrutar juntos\n\nIdealita es genial y esta idea tiene espacios','pendiente','2026-11-09 19:46:41');
/*!40000 ALTER TABLE `ideas` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `memoria`
--

DROP TABLE IF EXISTS `memoria`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `memoria` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` bigint unsigned NOT NULL,
  `tipo` varchar(50) NOT NULL,
  `contenido` text NOT NULL,
  `fecha` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_memoria_usuario` (`usuario_id`),
  KEY `idx_memoria_tipo` (`tipo`),
  CONSTRAINT `fk_memoria_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `memoria`
--

LOCK TABLES `memoria` WRITE;
/*!40000 ALTER TABLE `memoria` DISABLE KEYS */;
/*!40000 ALTER TABLE `memoria` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `mensajes`
--

DROP TABLE IF EXISTS `mensajes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `mensajes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `conversacion_id` bigint unsigned NOT NULL,
  `rol` enum('usuario','idealita') NOT NULL,
  `mensaje` longtext NOT NULL,
  `fecha` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_mensajes_conversacion` (`conversacion_id`),
  KEY `idx_mensajes_fecha` (`fecha`),
  CONSTRAINT `fk_mensajes_conversacion` FOREIGN KEY (`conversacion_id`) REFERENCES `conversaciones` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `mensajes`
--

LOCK TABLES `mensajes` WRITE;
/*!40000 ALTER TABLE `mensajes` DISABLE KEYS */;
/*!40000 ALTER TABLE `mensajes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `menu_items`
--

DROP TABLE IF EXISTS `menu_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `menu_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `funcionalidad_id` bigint unsigned DEFAULT NULL,
  `parent_id` bigint unsigned DEFAULT NULL,
  `orden` int NOT NULL DEFAULT '0',
  `publico` tinyint(1) NOT NULL DEFAULT '0',
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `idx_menu_parent` (`parent_id`),
  KEY `idx_menu_funcionalidad` (`funcionalidad_id`),
  CONSTRAINT `fk_menu_funcionalidad` FOREIGN KEY (`funcionalidad_id`) REFERENCES `funcionalidades` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_menu_parent` FOREIGN KEY (`parent_id`) REFERENCES `menu_items` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `menu_items`
--

LOCK TABLES `menu_items` WRITE;
/*!40000 ALTER TABLE `menu_items` DISABLE KEYS */;
INSERT INTO `menu_items` VALUES (9,'Inicio',1,NULL,1,1,1),(10,'Ideas',2,NULL,2,1,1),(11,'Servicios',NULL,NULL,3,1,1),(12,'Recursos Gratis',15,NULL,4,1,1),(13,'Contáctanos',16,NULL,5,1,1),(14,'Acerca de',NULL,NULL,6,1,1),(15,'Administración',8,NULL,7,1,1),(16,'Asesorías Financieras',9,11,1,1,1),(17,'Asesoría de Pensiones',10,11,2,1,1),(18,'Ideas Innovadoras',11,11,3,1,1),(19,'Emprendimientos',12,11,4,1,1),(20,'Clases de Inglés',13,11,5,1,1),(21,'Perfilamiento',14,11,6,1,1);
/*!40000 ALTER TABLE `menu_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `password_resets`
--

DROP TABLE IF EXISTS `password_resets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `password_resets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` bigint unsigned NOT NULL,
  `token_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `used` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `password_resets_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=48 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `password_resets`
--

LOCK TABLES `password_resets` WRITE;
/*!40000 ALTER TABLE `password_resets` DISABLE KEYS */;
INSERT INTO `password_resets` VALUES (1,2,'258973d159144f1e863262130e51ead54bed48fea89db989f4e3413895b0fbd6','2026-10-16 21:58:52','2026-10-16 21:28:52',1),(2,2,'0f6fb2d830f67f40d582e62d7e0267a43727c13c27e059b68b84b6b4d822a54a','2026-10-17 12:57:41','2026-10-17 12:27:41',1),(3,2,'2eb991aea0d468fbbbfdf8aea997931d2dcec08158452d26b663d63badf7fc88','2026-10-17 20:25:26','2026-10-17 19:55:25',1),(4,2,'dbfb8398c1be8281e45b298263f2a3526a87dc18e146224949a15a149bbfc569','2026-10-17 21:04:10','2026-10-17 20:34:09',1),(5,7,'143f40046a8a981d3abace3cdc3d0f9122847d7f4ed6f800f2540976b41834f8','2026-10-17 21:06:31','2026-10-17 20:36:30',1),(6,7,'13bc9d985a612f75869ba3cdc8476b19ae95c364d5727e148ee6530076db13e0','2026-10-17 21:13:10','2026-10-17 20:43:10',1),(7,7,'8141076f3d4e187656ceb0f9e2fa3a519fb29631e5f39a69abeb0767c755daaa','2026-10-17 21:14:47','2026-10-17 20:44:46',1),(8,2,'9d6c9f21587a0cc2624bfac71d4bb3d85c1969ad9f753b3ca322e360ed5c42a0','2026-10-17 21:17:20','2026-10-17 20:47:19',1),(9,7,'f70ef04b34893f1eed32bedce860b2f2588e5854f1593d3bc883b08272449052','2026-10-17 21:18:29','2026-10-17 20:48:29',0),(10,2,'a05b6e943082f0888dcb8ee954e94ce83f34975821429abd2a1bd9bf210482ed','2026-10-19 18:30:02','2026-10-19 18:00:01',1),(11,2,'f55f452eabf6fd51beb9701d09edb5e7bc45028017db0d5c1f2cc6a9cbaf7a8c','2026-10-21 09:38:58','2026-10-21 09:08:57',1),(12,2,'82d443938f2ea1df8ba2bb080e25d4096f35fbef64b068431540f8efb2dc17e3','2026-10-22 10:36:41','2026-10-22 10:06:40',1),(13,2,'982146b88afc792e8cc2552d7e378a1e9ce008747033e037ae3b4d58082c2c57','2026-10-22 12:11:02','2026-10-22 11:56:01',1),(14,2,'57e9bcc8733fe4a115bdc1db47f8bfe02ce4462bccd39932a0be4a9569ebb13c','2026-10-22 15:44:28','2026-10-22 15:34:28',1),(15,2,'df3dc9c5d9dfb2021e9baead94020b1d808853e1dbf8c17422071ac4c9cb905b','2026-10-23 09:30:20','2026-10-23 09:20:20',1),(16,2,'e40e0d4a2bbe8403f850cc06b25bf015a94037d229b3bbd56338301e7a3ea716','2026-10-23 11:26:28','2026-10-23 11:16:28',1),(17,2,'140a5b5ab7082f3dcb13a7b411897dbb6b50f62bf4468fe73dc18d1e50e1037f','2026-10-23 11:39:29','2026-10-23 11:29:29',1),(18,2,'daf375783082804e656991131bcb3b40e7801b94f355718e25e57b93db6da3fe','2026-10-23 15:06:01','2026-10-23 14:56:01',1),(19,2,'beabebfa60b2bf5360739881174d09ebccb1bb088f4ff6c905fb5cf41036ba18','2026-10-24 15:48:49','2026-10-24 15:38:49',1),(20,2,'53a6797057cc1c29b12690817129a77f6fb98ed5eadf3c20c61a46679f0dcce0','2026-10-25 17:33:02','2026-10-25 17:23:02',1),(21,2,'f2ba2a50e598c46e5a4b85745d17aa43346736dbed992ea9757f2482ac1b7360','2026-10-25 19:26:05','2026-10-25 19:16:05',1),(22,2,'0f2e8e9411f01ae7ba5c7107619f694bc082fb435b794c2044f1ca1a5f5bd9b8','2026-10-26 09:51:04','2026-10-26 09:41:04',1),(23,2,'f989bffbf8e36f0fd3e885c848e10615165d8b60f8f48b41c1486199906ef5eb','2026-10-26 11:57:25','2026-10-26 11:47:25',1),(24,2,'ca6128a2565f2d072e6c6f4b1025f8f968edbce81a62fbbce436745f085dc7bb','2026-10-27 09:43:44','2026-10-27 09:33:44',1),(25,2,'15ad4bb2e20ffec621369c0931f2c5b4ddd61ea40bbd12b8ef72e73ff7d9a243','2026-10-27 18:14:51','2026-10-27 18:04:50',1),(26,2,'32463688f3555ff3b45d7798245bcf031bdd2c84e4067a5a4506098cb241fdb4','2026-10-27 22:27:48','2026-10-27 22:17:48',1),(27,2,'4ef95e6d1436393a9dafde9db10e2c4a9e0856851bb9792ce181a2608d494f8c','2026-10-28 10:15:03','2026-10-28 10:05:03',1),(28,2,'371631c1da74905836caa8cf33549e516680555dbc77c85e986b32325267b866','2026-10-28 12:48:49','2026-10-28 12:38:49',1),(29,2,'ae71f7cc60726e20de6709524858216c418249aeb1515ad9919531eea9b2b290','2026-10-28 14:41:29','2026-10-28 14:31:29',1),(30,2,'5e55bc1c5c6d37a188a5677a3a4827d5f0e9156007f0f955d4bfa175e68fea33','2026-10-29 13:36:49','2026-10-29 13:26:49',1),(31,2,'ea0e8a874101465938249f44b7fe7c60bfd16bc50b782cbb32b2606b4b05ff87','2026-10-29 22:06:13','2026-10-29 21:56:13',1),(32,2,'6bd20c823019d3d3ad293ccb0517760f6cb2257ef13444b7cff61d59b5c2f92b','2026-10-29 22:21:48','2026-10-29 22:11:48',1),(40,2,'effd380cae27a7c1e2ac6d786868b3c18b28150e042c131c7aff237c20cb7fd5','2026-11-04 19:31:48','2026-11-04 19:21:48',1),(46,2,'c3677313378bddc00686c3249448a24df16d9bba955b6cbf34d63ab4c63b4c65','2026-11-06 17:35:56','2026-11-06 17:25:56',1),(47,2,'13c61d7c1613d6f6e4084e0a75ec8d21e8c6eedf9f0e930f042f5dffd88bc803','2026-11-08 20:11:43','2026-11-08 20:01:43',0);
/*!40000 ALTER TABLE `password_resets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `permisos`
--

DROP TABLE IF EXISTS `permisos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permisos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `codigo` varchar(100) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `fecha_creacion` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_permisos_codigo` (`codigo`)
) ENGINE=InnoDB AUTO_INCREMENT=1008 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `permisos`
--

LOCK TABLES `permisos` WRITE;
/*!40000 ALTER TABLE `permisos` DISABLE KEYS */;
INSERT INTO `permisos` VALUES (1,'ideas.read','Consultar ideas','Permite consultar ideas',1,'2026-10-07 17:22:59'),(2,'ideas.create','Crear ideas','Permite crear ideas',1,'2026-10-07 17:22:59'),(3,'ideas.update','Modificar ideas','Permite modificar ideas',1,'2026-10-07 17:22:59'),(4,'ideas.delete','Eliminar ideas','Permite eliminar ideas',1,'2026-10-07 17:22:59'),(5,'creaciones.read','Consultar creaciones','Permite consultar creaciones',1,'2026-10-07 17:22:59'),(6,'creaciones.create','Crear creaciones','Permite crear creaciones',1,'2026-10-07 17:22:59'),(7,'creaciones.update','Modificar creaciones','Permite modificar creaciones',1,'2026-10-07 17:22:59'),(8,'creaciones.delete','Eliminar creaciones','Permite eliminar creaciones',1,'2026-10-07 17:22:59'),(9,'dinero.read','Consultar Dinero','Permite acceder a la funcionalidad Dinero',1,'2026-10-07 17:22:59'),(10,'usuarios.read','Consultar usuarios','Permite consultar usuarios',1,'2026-10-07 17:22:59'),(11,'usuarios.create','Crear usuarios','Permite crear usuarios',1,'2026-10-07 17:22:59'),(12,'usuarios.update','Modificar usuarios','Permite modificar usuarios',1,'2026-10-07 17:22:59'),(13,'usuarios.delete','Eliminar usuarios','Permite eliminar usuarios',1,'2026-10-07 17:22:59'),(14,'roles.read','Consultar roles','Permite consultar roles',1,'2026-10-07 17:22:59'),(15,'roles.create','Crear roles','Permite crear roles',1,'2026-10-07 17:22:59'),(16,'roles.update','Modificar roles','Permite modificar roles',1,'2026-10-07 17:22:59'),(17,'roles.delete','Eliminar roles','Permite eliminar roles',1,'2026-10-07 17:22:59'),(18,'permisos.read','Consultar permisos','Permite consultar permisos',1,'2026-10-07 17:22:59'),(19,'permisos.update','Modificar permisos','Permite modificar permisos',1,'2026-10-07 17:22:59'),(20,'configuracion.read','Consultar configuración','Permite consultar configuración',1,'2026-10-07 17:22:59'),(21,'configuracion.update','Modificar configuración','Permite modificar configuración',1,'2026-10-07 17:22:59'),(22,'admin.access','Acceder a Administración','Permite acceder al módulo de administración',1,'2026-10-07 17:22:59'),(23,'asesoria_pensiones.read','Consultar Asesoría de Pensiones','Permite consultar la funcionalidad de Asesoría de Pensiones',1,'2026-10-27 19:35:51'),(24,'asesoria_pensiones.create','Crear Asesoría de Pensiones','Permite crear registros de Asesoría de Pensiones',1,'2026-10-27 19:35:51'),(25,'asesoria_pensiones.update','Modificar Asesoría de Pensiones','Permite modificar registros de Asesoría de Pensiones',1,'2026-10-27 19:35:52'),(26,'asesoria_pensiones.delete','Eliminar Asesoría de Pensiones','Permite eliminar registros de Asesoría de Pensiones',1,'2026-10-27 19:35:52'),(27,'perfilamiento.read','Consultar - Perfilamiento','Permite consultar en la funcionalidad Perfilamiento',1,'2026-10-27 19:49:12'),(28,'clases_ingles.read','Consultar - Clases de Inglés','Permite consultar en la funcionalidad Clases de Inglés',1,'2026-10-27 19:49:12'),(29,'emprendimientos.read','Consultar - Emprendimientos','Permite consultar en la funcionalidad Emprendimientos',1,'2026-10-27 19:49:12'),(30,'ideas_innovadoras.read','Consultar - Ideas Innovadoras','Permite consultar en la funcionalidad Ideas Innovadoras',1,'2026-10-27 19:49:12'),(31,'asesorias_financieras.read','Consultar - Asesorías Financieras','Permite consultar en la funcionalidad Asesorías Financieras',1,'2026-10-27 19:49:12'),(32,'perfilamiento.create','Crear - Perfilamiento','Permite crear en la funcionalidad Perfilamiento',1,'2026-10-27 19:49:12'),(33,'clases_ingles.create','Crear - Clases de Inglés','Permite crear en la funcionalidad Clases de Inglés',1,'2026-10-27 19:49:12'),(34,'emprendimientos.create','Crear - Emprendimientos','Permite crear en la funcionalidad Emprendimientos',1,'2026-10-27 19:49:12'),(35,'ideas_innovadoras.create','Crear - Ideas Innovadoras','Permite crear en la funcionalidad Ideas Innovadoras',1,'2026-10-27 19:49:12'),(36,'asesorias_financieras.create','Crear - Asesorías Financieras','Permite crear en la funcionalidad Asesorías Financieras',1,'2026-10-27 19:49:12'),(37,'perfilamiento.update','Modificar - Perfilamiento','Permite modificar en la funcionalidad Perfilamiento',1,'2026-10-27 19:49:12'),(38,'clases_ingles.update','Modificar - Clases de Inglés','Permite modificar en la funcionalidad Clases de Inglés',1,'2026-10-27 19:49:12'),(39,'emprendimientos.update','Modificar - Emprendimientos','Permite modificar en la funcionalidad Emprendimientos',1,'2026-10-27 19:49:12'),(40,'ideas_innovadoras.update','Modificar - Ideas Innovadoras','Permite modificar en la funcionalidad Ideas Innovadoras',1,'2026-10-27 19:49:12'),(41,'asesorias_financieras.update','Modificar - Asesorías Financieras','Permite modificar en la funcionalidad Asesorías Financieras',1,'2026-10-27 19:49:12'),(42,'perfilamiento.delete','Eliminar - Perfilamiento','Permite eliminar en la funcionalidad Perfilamiento',1,'2026-10-27 19:49:12'),(43,'clases_ingles.delete','Eliminar - Clases de Inglés','Permite eliminar en la funcionalidad Clases de Inglés',1,'2026-10-27 19:49:12'),(44,'emprendimientos.delete','Eliminar - Emprendimientos','Permite eliminar en la funcionalidad Emprendimientos',1,'2026-10-27 19:49:12'),(45,'ideas_innovadoras.delete','Eliminar - Ideas Innovadoras','Permite eliminar en la funcionalidad Ideas Innovadoras',1,'2026-10-27 19:49:12'),(46,'asesorias_financieras.delete','Eliminar - Asesorías Financieras','Permite eliminar en la funcionalidad Asesorías Financieras',1,'2026-10-27 19:49:12'),(58,'consultoria.read','Consultar Consultoria','Permite  tener acceso a consulta de consultoría',1,'2026-11-02 17:27:49'),(59,'Prueba1','Prueba1','Son pruebas en este caso  la 1',1,'2026-11-02 19:28:27'),(60,'funcionalidades.read','Consultar funcionalidades','Permite consultar las funcionalidades del sistema',1,'2026-11-06 13:39:04'),(61,'funcionalidades.create','Crear funcionalidades','Permite registrar nuevas funcionalidades en el sistema',1,'2026-11-06 13:39:04'),(62,'funcionalidades.update','Modificar funcionalidades','Permite modificar funcionalidades existentes',1,'2026-11-06 13:39:04'),(63,'funcionalidades.delete','Eliminar funcionalidades','Permite eliminar funcionalidades del sistema',1,'2026-11-06 13:39:04'),(64,'menus.read','Consultar menús','Permite consultar los elementos del menú dinámico',1,'2026-11-06 13:39:04'),(65,'menus.create','Crear menús','Permite registrar nuevos elementos en el menú',1,'2026-11-06 13:39:04'),(66,'menus.update','Modificar menús','Permite modificar elementos del menú',1,'2026-11-06 13:39:04'),(67,'menus.delete','Eliminar menús','Permite eliminar elementos del menú',1,'2026-11-06 13:39:04'),(68,'permisos.create','Crear permisos','Permite registrar nuevos permisos en el sistema',1,'2026-11-06 13:39:04'),(69,'permisos.delete','Eliminar permisos','Permite eliminar permisos del sistema',1,'2026-11-06 13:39:04'),(1000,'asociados.read','Consultar asociados','Permite consultar solicitudes de asociados',1,'2026-11-15 10:30:26'),(1001,'asociados.autorizar','Autorizar asociados','Permite aprobar solicitudes de asociados y activar sus cuentas',1,'2026-11-15 10:30:26'),(1002,'asociados.rechazar','Rechazar asociados','Permite rechazar solicitudes de asociados con observaciones obligatorias',1,'2026-11-15 10:30:26'),(1003,'asociados.pedir_informacion','Solicitar información a asociados','Permite solicitar información adicional a un candidato a asociado',1,'2026-11-15 10:30:26');
/*!40000 ALTER TABLE `permisos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `rol_permisos`
--

DROP TABLE IF EXISTS `rol_permisos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rol_permisos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `rol_id` bigint unsigned NOT NULL,
  `permiso_id` bigint unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_rol_permiso` (`rol_id`,`permiso_id`),
  KEY `fk_rol_permisos_permiso` (`permiso_id`),
  CONSTRAINT `fk_rol_permisos_permiso` FOREIGN KEY (`permiso_id`) REFERENCES `permisos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rol_permisos_rol` FOREIGN KEY (`rol_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=317 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rol_permisos`
--

LOCK TABLES `rol_permisos` WRITE;
/*!40000 ALTER TABLE `rol_permisos` DISABLE KEYS */;
INSERT INTO `rol_permisos` VALUES (192,2,1),(193,2,2),(194,2,3),(195,2,4),(196,2,5),(197,2,6),(198,2,7),(199,2,8),(200,2,9),(201,2,10),(202,2,11),(203,2,12),(204,2,13),(205,2,14),(206,2,15),(207,2,16),(208,2,17),(209,2,18),(210,2,19),(211,2,20),(212,2,21),(213,2,22),(214,2,23),(215,2,24),(216,2,25),(217,2,26),(218,2,27),(219,2,28),(220,2,29),(221,2,30),(222,2,31),(223,2,32),(224,2,33),(225,2,34),(226,2,35),(227,2,36),(228,2,37),(229,2,38),(230,2,39),(231,2,40),(232,2,41),(233,2,42),(234,2,43),(235,2,44),(236,2,45),(237,2,46),(238,2,58),(239,2,59),(240,2,60),(241,2,61),(242,2,62),(243,2,63),(244,2,64),(245,2,65),(246,2,66),(247,2,67),(248,2,68),(249,2,69),(276,2,1000),(274,2,1001),(277,2,1002),(275,2,1003),(269,1000,23),(270,1000,24),(271,1000,25),(272,1000,26);
/*!40000 ALTER TABLE `rol_permisos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(50) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `fecha_creacion` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=1036 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `roles`
--

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES (1,'usuario','Usuario normal de Idealandia',1,'2026-10-07 17:22:59'),(2,'administrador','Administrador de Idealandia',1,'2026-10-07 17:22:59'),(1000,'Especial','Solo algunas opciones de menu',1,'2026-10-27 17:40:43'),(1001,'Asociado','Rol asignado a proveedores asociados de Idealandia',1,'2026-11-15 10:30:26');
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `servicios`
--

DROP TABLE IF EXISTS `servicios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `servicios` (
  `id` int NOT NULL,
  `nombre` varchar(150) NOT NULL,
  `descripcion` varchar(500) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `fecha_creacion` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `servicios`
--

LOCK TABLES `servicios` WRITE;
/*!40000 ALTER TABLE `servicios` DISABLE KEYS */;
INSERT INTO `servicios` VALUES (1,'Clases de Inglés','Servicio de enseñanza y clases de idioma inglés',1,'2026-11-15 10:30:25'),(2,'Consultoría','Servicio de consultoría especializada',1,'2026-11-15 10:30:25'),(3,'Coaching Profesional','Servicio de coaching y desarrollo profesional',1,'2026-11-15 10:30:25'),(4,'Asesoría en Pensiones','Servicio de asesoría y orientación en pensiones',1,'2026-11-15 10:30:25'),(5,'Asesoría Financiera','Servicio de asesoría y planeación financiera',1,'2026-11-15 10:30:25'),(6,'Meditación y Mindfulness','Servicio de meditación, mindfulness y bienestar',1,'2026-11-15 10:30:25'),(7,'Asesoría en Ideas creativas','Servicio de consultoría y asesoría en ideas creativas',1,'2026-11-15 10:30:25'),(8,'Emprendimientos e Innovación','Servicio de apoyo a emprendimientos e innovación',1,'2026-11-15 10:30:25'),(999,'Otros','Otro servicio personalizado no listado en el catálogo',1,'2026-11-15 10:30:25');
/*!40000 ALTER TABLE `servicios` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `solicitudes_asociado`
--

DROP TABLE IF EXISTS `solicitudes_asociado`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `solicitudes_asociado` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` bigint unsigned NOT NULL,
  `servicio_id` int NOT NULL,
  `descripcion_servicio` text NOT NULL,
  `nombre_servicio_otro` varchar(150) DEFAULT NULL,
  `estatus` enum('por_aprobar','mas_informacion','autorizado','rechazado') NOT NULL DEFAULT 'por_aprobar',
  `observaciones` text,
  `fecha_solicitud` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `fecha_actualizacion` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `usuario_revisor_id` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_solicitud_servicio` (`servicio_id`),
  KEY `fk_solicitud_revisor` (`usuario_revisor_id`),
  KEY `idx_solicitud_usuario` (`usuario_id`),
  KEY `idx_solicitud_estatus` (`estatus`),
  KEY `idx_solicitud_fecha` (`fecha_solicitud`),
  CONSTRAINT `fk_solicitud_revisor` FOREIGN KEY (`usuario_revisor_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_solicitud_servicio` FOREIGN KEY (`servicio_id`) REFERENCES `servicios` (`id`),
  CONSTRAINT `fk_solicitud_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=63 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `solicitudes_asociado`
--

LOCK TABLES `solicitudes_asociado` WRITE;
/*!40000 ALTER TABLE `solicitudes_asociado` DISABLE KEYS */;
INSERT INTO `solicitudes_asociado` VALUES (55,1082,1,'Juan Perez\n\nNumero 2534908765',NULL,'autorizado','De acuerdo danos una referencia con nombre y numero','2026-11-15 19:23:52','2026-11-15 19:30:55',2),(56,1083,3,'Lo mismo que mi papa\n\nTengo grandes referencias',NULL,'por_aprobar','Mandame mas detalle','2026-11-15 19:54:43','2026-11-15 21:59:22',1082);
/*!40000 ALTER TABLE `solicitudes_asociado` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tokens_solicitud_asociado`
--

DROP TABLE IF EXISTS `tokens_solicitud_asociado`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tokens_solicitud_asociado` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `solicitud_id` bigint unsigned NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `expira_en` datetime NOT NULL,
  `usado` tinyint(1) NOT NULL DEFAULT '0',
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_token_solicitud_hash` (`token_hash`),
  KEY `idx_token_solicitud_id` (`solicitud_id`),
  CONSTRAINT `fk_token_solicitud` FOREIGN KEY (`solicitud_id`) REFERENCES `solicitudes_asociado` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=37 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tokens_solicitud_asociado`
--

LOCK TABLES `tokens_solicitud_asociado` WRITE;
/*!40000 ALTER TABLE `tokens_solicitud_asociado` DISABLE KEYS */;
INSERT INTO `tokens_solicitud_asociado` VALUES (28,55,'d76597d47da652d4d2536cbc43769acec23ab1577e2c0a7426894e1593bac0d0','2026-11-22 19:25:59',1,'2026-11-15 19:25:59'),(29,55,'4de049cfa3a67357485d2f607363227c7e0fae00c7e1a69cdbdcb1f796439a6a','2026-11-22 19:28:04',1,'2026-11-15 19:28:04'),(36,56,'98ca8c5f9f90b35e4a40f3772429223e14ccb087e3964a84af6ebeab62a64c4f','2026-11-22 21:58:56',1,'2026-11-15 21:58:56');
/*!40000 ALTER TABLE `tokens_solicitud_asociado` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `usuario_funcionalidades`
--

DROP TABLE IF EXISTS `usuario_funcionalidades`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usuario_funcionalidades` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` bigint unsigned NOT NULL,
  `funcionalidad_id` bigint unsigned NOT NULL,
  `tipo_acceso` enum('permanente','temporal') COLLATE utf8mb4_unicode_ci NOT NULL,
  `fecha_inicio` datetime DEFAULT NULL,
  `fecha_fin` datetime DEFAULT NULL,
  `estado` enum('activo','revocado') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'activo',
  `asignado_por` bigint unsigned DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_uf_usuario` (`usuario_id`),
  KEY `fk_uf_funcionalidad` (`funcionalidad_id`),
  KEY `fk_uf_asignado_por` (`asignado_por`),
  CONSTRAINT `fk_uf_asignado_por` FOREIGN KEY (`asignado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_uf_funcionalidad` FOREIGN KEY (`funcionalidad_id`) REFERENCES `funcionalidades` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_uf_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=48 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `usuario_funcionalidades`
--

LOCK TABLES `usuario_funcionalidades` WRITE;
/*!40000 ALTER TABLE `usuario_funcionalidades` DISABLE KEYS */;
INSERT INTO `usuario_funcionalidades` VALUES (13,1005,13,'temporal','2026-11-09 17:28:00','2026-11-09 17:33:00','activo',2,'2026-11-09 17:28:22','2026-11-09 17:30:51'),(14,1007,2,'temporal','2026-11-09 19:41:00','2026-11-09 19:48:00','activo',2,'2026-11-09 19:41:57','2026-11-09 19:46:19'),(15,1082,8,'temporal','2026-11-15 19:52:00','2026-11-15 22:05:00','activo',2,'2026-11-15 19:52:39','2026-11-15 21:50:37');
/*!40000 ALTER TABLE `usuario_funcionalidades` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `usuario_roles`
--

DROP TABLE IF EXISTS `usuario_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usuario_roles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` bigint unsigned NOT NULL,
  `rol_id` bigint unsigned NOT NULL,
  `fecha_asignacion` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_usuario_rol` (`usuario_id`,`rol_id`),
  KEY `fk_usuario_roles_rol` (`rol_id`),
  CONSTRAINT `fk_usuario_roles_rol` FOREIGN KEY (`rol_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_usuario_roles_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=151 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `usuario_roles`
--

LOCK TABLES `usuario_roles` WRITE;
/*!40000 ALTER TABLE `usuario_roles` DISABLE KEYS */;
INSERT INTO `usuario_roles` VALUES (22,1003,1,'2026-11-04 18:33:32'),(27,7,1000,'2026-11-07 21:52:53'),(28,2,2,'2026-11-08 08:40:52'),(29,1004,1,'2026-11-08 17:01:27'),(30,1005,1,'2026-11-08 20:04:24'),(31,1006,1,'2026-11-09 19:38:04'),(32,1007,1,'2026-11-09 19:39:31'),(109,1082,1001,'2026-11-15 19:23:52'),(110,1083,1001,'2026-11-15 19:54:43');
/*!40000 ALTER TABLE `usuario_roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `usuarios`
--

DROP TABLE IF EXISTS `usuarios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usuarios` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `usuario` varchar(50) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `telefono` varchar(30) DEFAULT NULL,
  `email` varchar(150) NOT NULL,
  `fecha` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `jwt_version` int DEFAULT '1',
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_usuarios_usuario` (`usuario`),
  UNIQUE KEY `uq_usuarios_email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=1140 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `usuarios`
--

LOCK TABLES `usuarios` WRITE;
/*!40000 ALTER TABLE `usuarios` DISABLE KEYS */;
INSERT INTO `usuarios` VALUES (2,'Efrain','$2b$10$PM5wv435HZtq9l51tEKCyOzwWLy4rn3hEcpsnHE0yOjSjRNO6dxeS','Efrain Garduño Flores','5532927943','efrain_garduno@hotmail.com','2026-09-30 01:39:48',1,1),(7,'Arturito','$2b$10$DwU0PzABp0ybxwP8NImk8OwQ.GdLbNt1fgwVqCw4YDJ7DKy4/6xF.','Arturito Matus','5540713420','nagualitox1@gmail.com','2026-10-16 18:49:58',4,1),(1003,'Liana','$2b$10$dIBPA1IXezVD7Eq6PHsnQezWGeqr9RoxfZs2upq/M3thc0pcQhydS','Liana Perez Leyva','5544332211','lianaleyva@hotmail.com','2026-11-04 09:37:37',1,1),(1004,'Martin','$2b$10$Dj.HnHTAmyr1sg.tq.XOj.i.DD6Q2Tj8c983V46Avv8UY3DCY4B86','Martin Matus','55205634550','nagualitoh@hotmail.com','2026-11-08 16:59:56',1,1),(1005,'Tata','$2b$10$oKKK8HLy8rgy9KjhGymmHOta8XwHxqAqqHDbKcE95UrBo8pRgXi9q','Tatita','11233346','esta@otra.com','2026-11-08 20:02:18',1,1),(1006,'Marcial','$2b$10$.RDu0ttvlKmu9QSkrtapz.vPLD1/gEo5PCKNlTM5ZQsLkh0V7xQde','Mimarcial','234567986','marcialito@gmail.com','2026-11-09 19:38:04',1,1),(1007,'Mariana','$2b$10$.MH0f3PdGeScGcUoh4Tv6OzVLlZH4TKrcoHpL12Ot.EwA84cpsAiK','Mariana Sayavedra','2335786534','mariana@gmail.com','2026-11-09 19:39:31',1,1),(1082,'Jorge','$2b$10$matScMiLyECINyWbwOX23OI9xqWKtzsjRAc0Obsf6gUyvL/pBlfg6','Jorge Islas Rivera','+524489534320','nagualitoz1@gmail.com','2026-11-15 19:23:52',1,1),(1083,'Jorge1','$2b$10$Fbp98sniVxPq1CCG.vF2nOcuO3OFlZZqZj6kolXdY/CwrBSpXyopi','Jorge Islas Hijo','+524432675423','nagualitoz@gmail.com','2026-11-15 19:54:43',1,0);
/*!40000 ALTER TABLE `usuarios` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `verificaciones_correo`
--

DROP TABLE IF EXISTS `verificaciones_correo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `verificaciones_correo` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` bigint unsigned NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `expira_en` datetime NOT NULL,
  `usado` tinyint(1) NOT NULL DEFAULT '0',
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_verif_token_hash` (`token_hash`),
  KEY `idx_verif_usuario` (`usuario_id`),
  CONSTRAINT `fk_verif_correo_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=63 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `verificaciones_correo`
--

LOCK TABLES `verificaciones_correo` WRITE;
/*!40000 ALTER TABLE `verificaciones_correo` DISABLE KEYS */;
INSERT INTO `verificaciones_correo` VALUES (55,1082,'ac092d1e4037b3c45825b8ac455dc2d30970517b7ac65c29f0d8a5a5cd88a250','2026-11-15 19:33:52',1,'2026-11-15 19:23:52'),(56,1083,'26b06ac1d49e250502ace256ada6efb1addffd044e678140aab2771fd80c1a9a','2026-11-15 20:04:43',1,'2026-11-15 19:54:43');
/*!40000 ALTER TABLE `verificaciones_correo` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping events for database 'idealandia_dev'
--

--
-- Dumping routines for database 'idealandia_dev'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-11-16 18:05:41
