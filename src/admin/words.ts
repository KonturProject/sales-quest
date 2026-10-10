/**
 * Simple Russian nouns in latin letters for the access phrase (plan 2a): easy to say aloud and to
 * type on any keyboard. 304 words: four of them and two digits ≈ 39 bits — with PBKDF2 (SEC-6)
 * guessing takes a GPU months, enough for the department's numbers.
 */
export const WORDS: readonly string[] = `
arbuz avtobus aist akula albom almaz ananas apelsin arka astra babochka baraban barsuk bashnya bereg
bereza bilet blin bober bochka boloto borsch brevno budka bukva bulka burya vagon valenok varenye vaza vedro veer
velosiped veter vetka vilka vishnya vodopad volk volna vorona vorota gazeta galka gamak gvozd gitara glina gnezdo
golub gora gorod gorokh granat grib grom grusha gubka gusenitsa gus dvor delfin derevo divan dozhd dolina dom doroga
drakon drova dub dyatel dynya ezh elka enot zhuk zhuravl zavod zamok zayac zvezda zebra zerno zerkalo zima zmey
zontik zubr igla igra izba iskra iyul kabachok kamen kanal kapusta karandash karta kartina kaska kater kashtan kedr
kino kist klen klyuch kniga kobra kover koleso kolokol kometa komod konfeta kon korabl korova korzina koster kot
krab kran krepost krolik kruzhka kubik kuvshin kukla kupol kust lampa lastochka lebed led lenta les lestnitsa lev
limon lipa lisa list lodka lozhka los luk luna luzha lyagushka mayak malina mak mandarin marka medved med mel
melnitsa meteor mech mishen molot moloko more morkov most motor muravey myach nebo nitka nora nosorog oblako ovrag
ogon ogurets ozero okean olen orekh orel osa ostrov oves palatka palma parus pastila pech pero pesok pesnya pirog
planeta plot podsolnukh poezd pole polka pomidor portfel prud ptitsa pugovitsa pchela raduga raketa rakushka rebus
reka repa rog roza roshcha ruchey ruchka ryba rys ryukzak sad sanki sapog sakhar svecha sever sekret seno sinitsa
skala skamya skvorets sliva slon smorodina sneg sobaka sova solntse sosna sputnik stakan stol strela stul sumka
sunduk syr taburet tarelka teatr telega tigr tropa truba tucha tulpan tuman tykva ugol udochka ulitka uley utka
utro fakel fasol fialka flag fonar fontan forel khleb kholm khvost tsvetok tsirk chayka chaynik chas chashka chernika
cherepakha chesnok chudo shar shakhmaty shapka shishka shkaf shkola shlyapa shmel shchuka yabloko yagoda yakor yantar
yashchik yurta
`
  .trim()
  .split(/\s+/);
